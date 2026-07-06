// Provider stream shared helpers implement reusable stream wrappers and payload policies.
import { randomUUID } from "node:crypto";
import {
  extractStandalonePlainTextToolCallText,
  normalizePlainTextToolCallStreamEvents,
  promoteStandalonePlainTextToolCallMessage,
  scrubOverCapPlainTextToolCallMessage,
  type PlainTextToolCallNameMatcher,
  type PlainTextToolCallMessageNormalization,
} from "../../packages/tool-call-repair/src/index.ts";
import { resolveOpenAIReasoningEffortMap } from "../agents/openai-reasoning-compat.ts";
import { resolveOpenAIReasoningEffortForModel } from "../agents/openai-reasoning-effort.ts";
import type { StreamFn } from "../agents/runtime/index.ts";
import type { ThinkLevel } from "../auto-reply/thinking.ts";
import { mapThinkingLevelToReasoningEffort } from "../llm/providers/stream-wrappers/reasoning-effort-utils.ts";
import { streamWithPayloadPatch } from "../llm/providers/stream-wrappers/stream-payload-utils.ts";
import { streamSimple } from "../llm/stream.ts";
import { createAssistantMessageEventStream } from "../llm/utils/event-stream.ts";
export { applyAnthropicRefusal } from "../shared/anthropic-refusal.ts";
export { createDeferredEventBuffer } from "../shared/deferred-event-buffer.ts";
export { notifyLlmRequestActivity, onLlmRequestActivity } from "../shared/llm-request-activity.ts";

/** Optional provider stream decorator factory used by shared provider wrappers. */
export type ProviderStreamWrapperFactory =
  /** Wrapper factory that can decorate, replace, or omit a provider stream function. */
  ((streamFn: StreamFn | undefined) => StreamFn | undefined) | null | undefined | false;

/** Compose stream wrapper factories from left to right around a base stream function. */
export function composeProviderStreamWrappers(
  /** Base provider stream function to pass through the wrapper chain. */
  baseStreamFn: StreamFn | undefined,
  /** Ordered wrapper factories; falsey entries are skipped. */
  ...wrappers: ProviderStreamWrapperFactory[]
): StreamFn | undefined {
  return wrappers.reduce(
    (streamFn, wrapper) => (wrapper ? wrapper(streamFn) : streamFn),
    baseStreamFn,
  );
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function resolveContextToolNames(context: Parameters<StreamFn>[1]): Set<string> {
  const tools = (context as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) {
    return new Set();
  }
  const names = tools
    .map((tool) => {
      const record = toRecord(tool);
      return typeof record?.name === "string" && record.name.trim() ? record.name : undefined;
    })
    .filter((name): name is string => Boolean(name));
  return new Set(names);
}

function createSyntheticToolCallId(): string {
  return `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function createPlainTextToolCallBlock(parsed: {
  arguments: Record<string, unknown>;
  name: string;
}): Record<string, unknown> {
  return {
    type: "toolCall",
    id: createSyntheticToolCallId(),
    name: parsed.name,
    arguments: parsed.arguments,
    partialArgs: JSON.stringify(parsed.arguments),
  };
}

function promotePlainTextToolCalls(
  message: unknown,
  toolNames: Set<string>,
): Record<string, unknown> | undefined {
  const messageRecord = toRecord(message);
  if (
    Array.isArray(messageRecord?.content) &&
    messageRecord.content.some((block) => toRecord(block)?.type === "toolCall")
  ) {
    return undefined;
  }
  return promoteStandalonePlainTextToolCallMessage({
    allowedToolNames: toolNames,
    createToolCallBlock: (block, name) => createPlainTextToolCallBlock({ ...block, name }),
    isRetainableNonTextBlock: () => true,
    message,
  });
}

function emitPromotedToolCallEvents(
  stream: { push(event: unknown): void },
  message: Record<string, unknown>,
): void {
  const content = Array.isArray(message.content) ? message.content : [];
  content.forEach((block, contentIndex) => {
    const record = toRecord(block);
    if (record?.type !== "toolCall") {
      return;
    }
    stream.push({ type: "toolcall_start", contentIndex, partial: message });
    stream.push({
      type: "toolcall_delta",
      contentIndex,
      delta: typeof record.partialArgs === "string" ? record.partialArgs : "{}",
      partial: message,
    });
  });
}

function extractPlainTextToolCallCandidate(message: unknown): string | undefined {
  return extractStandalonePlainTextToolCallText({
    allowOtherNonTextBlocks: true,
    message,
  });
}

function createProviderToolNameMatcher(toolNames: Set<string>): PlainTextToolCallNameMatcher {
  return {
    hasExactName: (name) => toolNames.has(name),
    hasNamePrefix: (prefix) => {
      for (const toolName of toolNames) {
        if (toolName.startsWith(prefix)) {
          return true;
        }
      }
      return false;
    },
  };
}

function normalizeProviderDoneMessage(
  message: unknown,
  reason: unknown,
  toolNames: Set<string>,
  matcher: PlainTextToolCallNameMatcher,
): PlainTextToolCallMessageNormalization {
  const scrubbedMessage = scrubOverCapPlainTextToolCallMessage({
    candidateText: extractPlainTextToolCallCandidate(message),
    matcher,
    message,
  });
  if (scrubbedMessage) {
    return { kind: "scrubbed", message: scrubbedMessage };
  }
  // Token-limit and error terminals can leave complete-looking tool syntax.
  // Only normal completion or explicit tool use may promote it into an executable call.
  if (reason !== "stop" && reason !== "toolUse") {
    return undefined;
  }
  const promotedMessage = promotePlainTextToolCalls(message, toolNames);
  return promotedMessage ? { kind: "promoted", message: promotedMessage } : undefined;
}

function wrapPlainTextToolCallStream(
  source: ReturnType<StreamFn>,
  context: Parameters<StreamFn>[1],
): ReturnType<StreamFn> {
  const toolNames = resolveContextToolNames(context);
  if (toolNames.size === 0) {
    return source;
  }
  const matcher = createProviderToolNameMatcher(toolNames);
  const output = createAssistantMessageEventStream();
  const stream = output as unknown as { push(event: unknown): void; end(): void };

  void (async () => {
    let ended = false;
    const endStream = () => {
      if (!ended) {
        ended = true;
        stream.end();
      }
    };

    try {
      const normalizedEvents = normalizePlainTextToolCallStreamEvents(
        source as AsyncIterable<unknown>,
        {
          createPromotedToolCallEvents: (message) => {
            const events: unknown[] = [];
            emitPromotedToolCallEvents({ push: (event: unknown) => events.push(event) }, message);
            return events;
          },
          matcher,
          normalizeDoneMessage: ({ message, reason }) =>
            normalizeProviderDoneMessage(message, reason, toolNames, matcher),
          stopAfterDone: true,
        },
      );
      for await (const event of normalizedEvents) {
        stream.push(event);
      }
    } catch (error) {
      stream.push({
        type: "error",
        reason: "error",
        error: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      endStream();
    }
  })();

  return output as ReturnType<StreamFn>;
}

/**
 * Provider stream wrapper for local/proxy providers that sometimes emit a
 * standalone textual tool-call block even when native tool calling is enabled.
 */
export function createPlainTextToolCallCompatWrapper(
  /** Provider stream function to wrap; defaults to the simple stream implementation. */
  baseStreamFn: StreamFn | undefined,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const maybeStream = underlying(model, context, options);
    if (maybeStream && typeof maybeStream === "object" && "then" in maybeStream) {
      return Promise.resolve(maybeStream).then((stream) =>
        wrapPlainTextToolCallStream(stream, context),
      ) as ReturnType<StreamFn>;
    }
    return wrapPlainTextToolCallStream(maybeStream, context);
  };
}

/** Wrap a provider stream so callers can patch the outbound provider payload once. */
export function createPayloadPatchStreamWrapper(
  /** Provider stream function whose outbound payload should be patched. */
  baseStreamFn: StreamFn | undefined,
  patchPayload: (params: {
    /** Mutable provider payload immediately before the underlying stream dispatches it. */
    payload: Record<string, unknown>;
    /** Model selected for the stream call. */
    model: Parameters<StreamFn>[0];
    /** Stream context passed by the runtime. */
    context: Parameters<StreamFn>[1];
    /** Stream options passed by the runtime. */
    options: Parameters<StreamFn>[2];
  }) => void,
  wrapperOptions?: {
    shouldPatch?: (params: {
      /** Model selected for the stream call. */
      model: Parameters<StreamFn>[0];
      /** Stream context passed by the runtime. */
      context: Parameters<StreamFn>[1];
      /** Stream options passed by the runtime. */
      options: Parameters<StreamFn>[2];
    }) => boolean;
  },
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (wrapperOptions?.shouldPatch && !wrapperOptions.shouldPatch({ model, context, options })) {
      return underlying(model, context, options);
    }
    return streamWithPayloadPatch(underlying, model, context, options, (payload) =>
      patchPayload({ payload, model, context, options }),
    );
  };
}

/**
 * Applies explicit disabled-thinking intent to OpenAI-compatible Chat
 * Completions payloads without changing enabled reasoning levels.
 */
export function createOpenAICompatibleCompletionsThinkingOffWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel?: ThinkLevel,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  if (thinkingLevel !== "off") {
    return underlying;
  }
  return (model, context, options) => {
    if (model.api !== "openai-completions") {
      return underlying(model, context, options);
    }
    return streamWithPayloadPatch(underlying, model, context, options, (payload) => {
      if (!("reasoning_effort" in payload)) {
        return;
      }
      const disabled = resolveOpenAIReasoningEffortForModel({
        model,
        effort: "none",
        fallbackMap: resolveOpenAIReasoningEffortMap({
          provider: typeof model.provider === "string" ? model.provider : null,
          id: typeof model.id === "string" ? model.id : null,
          compat: model.compat,
        }),
      });
      if (disabled) {
        payload.reasoning_effort = disabled;
      } else {
        delete payload.reasoning_effort;
      }
    });
  };
}

/** Applies the shared reasoning payload policy used by OpenAI-compatible proxy providers. */
export function normalizeOpenAICompatibleReasoningPayload(
  payload: Record<string, unknown>,
  thinkingLevel?: ThinkLevel,
): void {
  delete payload.reasoning_effort;
  if (!thinkingLevel || thinkingLevel === "off") {
    return;
  }

  const existingReasoning = payload.reasoning;
  if (
    existingReasoning &&
    typeof existingReasoning === "object" &&
    !Array.isArray(existingReasoning)
  ) {
    const reasoning = existingReasoning as Record<string, unknown>;
    if (!("max_tokens" in reasoning) && !("effort" in reasoning)) {
      reasoning.effort = mapThinkingLevelToReasoningEffort(thinkingLevel);
    }
  } else if (!existingReasoning) {
    payload.reasoning = {
      effort: mapThinkingLevelToReasoningEffort(thinkingLevel),
    };
  }
}

/** Applies Qwen chat-template thinking flags without discarding provider-specific kwargs. */
export function setQwenChatTemplateThinking(
  payload: Record<string, unknown>,
  enabled: boolean,
): void {
  const existing = payload.chat_template_kwargs;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    const next: Record<string, unknown> = {
      ...(existing as Record<string, unknown>),
      enable_thinking: enabled,
    };
    if (!Object.hasOwn(next, "preserve_thinking")) {
      next.preserve_thinking = true;
    }
    payload.chat_template_kwargs = next;
    return;
  }
  payload.chat_template_kwargs = {
    enable_thinking: enabled,
    preserve_thinking: true,
  };
}
