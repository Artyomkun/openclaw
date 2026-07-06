// Outbound delivery core
import { runReplyPayloadSendingHook } from "../../auto-reply/reply/reply-payload-sending-hook.ts";
import type { ReplyPayload } from "../../auto-reply/types.ts";
import { createRenderedMessageBatchPlan } from "../../channels/message/rendered-batch.ts";
import type {
  ChannelMessageSendResult,
} from "../../channels/message/types.ts";
import { loadChannelOutboundAdapter } from "../../channels/plugins/outbound/load.ts";
import type {
  ChannelOutboundAdapter,
  ChannelOutboundTargetRef,
} from "../../channels/plugins/types.adapters.ts";
import type { ReplyToMode } from "../../config/types.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { fireAndForgetHook } from "../../hooks/fire-and-forget.ts";
import { createInternalHookEvent, triggerInternalHook } from "../../hooks/internal-hooks.ts";
import {
  buildCanonicalSentMessageHookContext,
  toInternalMessageSentContext,
  toPluginMessageContext,
  toPluginMessageSentEvent,
} from "../../hooks/message-hook-mappers.ts";
import {
  hasReplyPayloadContent,
  normalizeMessagePresentation,
  type ReplyPayloadDeliveryPin,
} from "../../interactive/payload.ts";
import { createSubsystemLogger } from "../../logging/subsystem.ts";
import type { OutboundMediaAccess } from "../../media/load-options.ts";
import { resolveAgentScopedOutboundMediaAccess } from "../../media/read-capability.ts";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.ts";
import { formatErrorMessage } from "../errors.ts";
import { resolveOutboundChannelMessageAdapter } from "./channel-resolution.ts";
import {
  OutboundDeliveryError,
  type OutboundDeliveryResult,
  type OutboundPayloadDeliveryOutcome,
} from "./deliver-types.ts";
import {
  attachOutboundDeliveryCommitHook,
  runOutboundDeliveryCommitHooks,
} from "./delivery-commit-hooks.ts";
import {
  ackDelivery,
  enqueueDelivery,
  failDelivery,
  markDeliveryPlatformOutcomeUnknown,
  markDeliveryPlatformSendAttemptStarted,
  type QueuedReplyPayloadSendingHook,
  withActiveDeliveryClaim,
} from "./delivery-queue.ts";
import type { OutboundDeliveryFormattingOptions } from "./formatting.ts";
import type { OutboundIdentity } from "./identity.ts";
import {
  planOutboundMediaMessageUnits,
  planOutboundTextMessageUnits,
  type OutboundMessageSendOverrides,
} from "./message-plan.ts";
import type { DeliveryMirror } from "./mirror.ts";
import {
  createOutboundPayloadPlan,
  summarizeOutboundPayloadForTransport,
  type NormalizedOutboundPayload,
  type OutboundPayloadPlan,
} from "./payloads.ts";
import { resolveMirroredTranscriptText } from "../../config/sessions/transcript-mirror.ts";
import { stripInternalRuntimeScaffolding } from "./sanitize-text.ts";
import type { OutboundSendDeps } from "./send-deps.ts";
import type { OutboundSessionContext } from "./session-context.ts";
import type { OutboundChannel } from "./targets.ts";

const log = createSubsystemLogger("outbound/deliver");
const isAbortError = (err: unknown): boolean => err instanceof Error && err.name === "AbortError";
const isDeliveryAbortError = (err: unknown): boolean =>
  isAbortError(err) ||
  (err instanceof OutboundDeliveryError && isAbortError((err as Error & { cause?: unknown }).cause));

export type { OutboundDeliveryResult } from "./deliver-types.ts";
export type { NormalizedOutboundPayload } from "./payloads.ts";
export { normalizeOutboundPayloads } from "./payloads.ts";
export { resolveOutboundSendDep, type OutboundSendDeps } from "./send-deps.ts";

type ChannelHandler = {
  chunker: ChannelOutboundAdapter["chunker"] | null;
  chunkerMode?: "text" | "markdown";
  textChunkLimit?: number;
  supportsMedia: boolean;
  sanitizeText?: (payload: ReplyPayload) => string;
  normalizePayload?: (payload: ReplyPayload) => ReplyPayload | null;
  sendTextOnlyErrorPayloads?: boolean;
  renderPresentation?: (payload: ReplyPayload) => Promise<ReplyPayload | null>;
  presentationCapabilities?: ChannelOutboundAdapter["presentationCapabilities"];
  pinDeliveredMessage?: (params: {
    target: ChannelOutboundTargetRef;
    messageId: string;
    pin: ReplyPayloadDeliveryPin;
    gatewayClientScopes?: readonly string[];
  }) => Promise<void>;
  afterDeliverPayload?: (params: {
    target: ChannelOutboundTargetRef;
    payload: ReplyPayload;
    results: readonly OutboundDeliveryResult[];
  }) => Promise<void>;
  buildTargetRef: (overrides?: { threadId?: string | number | null }) => ChannelOutboundTargetRef;
  shouldSkipPlainTextSanitization?: (payload: ReplyPayload) => boolean;
  resolveEffectiveTextChunkLimit?: (fallbackLimit?: number) => number | undefined;
  sendPayload?: (payload: ReplyPayload, overrides?: OutboundMessageSendOverrides) => Promise<OutboundDeliveryResult>;
  sendText: (text: string, overrides?: OutboundMessageSendOverrides) => Promise<OutboundDeliveryResult>;
  sendMedia: (caption: string, mediaUrl: string, overrides?: OutboundMessageSendOverrides) => Promise<OutboundDeliveryResult>;
};

type DeliverOutboundPayloadsCoreParams = {
  cfg: OpenClawConfig;
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  payloads: ReplyPayload[];
  replyToId?: string | null;
  replyToMode?: ReplyToMode;
  formatting?: OutboundDeliveryFormattingOptions;
  threadId?: string | number | null;
  identity?: OutboundIdentity;
  deps?: OutboundSendDeps;
  mediaAccess?: OutboundMediaAccess;
  gifPlayback?: boolean;
  forceDocument?: boolean;
  replyPayloadSendingHook?: QueuedReplyPayloadSendingHook;
  abortSignal?: AbortSignal;
  bestEffort?: boolean;
  onError?: (err: unknown, payload: NormalizedOutboundPayload) => void;
  onPayload?: (payload: NormalizedOutboundPayload) => void;
  onPayloadDeliveryOutcome?: (outcome: OutboundPayloadDeliveryOutcome) => void;
  session?: OutboundSessionContext;
  mirror?: DeliveryMirror;
  silent?: boolean;
  gatewayClientScopes?: readonly string[];
};

// ===== УТИЛИТЫ =====
const safeQueueAction = async <T>(
  action: () => Promise<T>,
  fallback: T,
  queuePolicy: "required" | "best_effort",
  warnMsg: string,
): Promise<T> => {
  try {
    return await action();
  } catch (err) {
    if (queuePolicy === "required") throw err;
    log.warn(`${warnMsg}: ${formatErrorMessage(err)}`);
    return fallback;
  }
};

const hasDeliveryIdentity = (r: OutboundDeliveryResult): boolean =>
  Boolean(r.messageId || r.chatId || r.channelId || r.roomId || r.conversationId || r.toJid || r.pollId);

const pushIfIdentified = (results: OutboundDeliveryResult[], result: OutboundDeliveryResult): boolean =>
  hasDeliveryIdentity(result) ? (results.push(result), true) : false;

const normalizePin = (payload: ReplyPayload): ReplyPayloadDeliveryPin | undefined => {
  const pin = payload.delivery?.pin;
  if (pin === true) return { enabled: true };
  if (!pin || typeof pin !== "object" || Array.isArray(pin)) return undefined;
  if (!pin.enabled) return undefined;
  const normalized: ReplyPayloadDeliveryPin = { enabled: true };
  if (pin.notify === true) normalized.notify = true;
  if (pin.required === true) normalized.required = true;
  return normalized;
};

// ===== ОСНОВНАЯ ЛОГИКА =====
export async function deliverOutboundPayloadsInternal(params: {
  cfg: OpenClawConfig;
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  payloads: ReplyPayload[];
  replyToId?: string | null;
  replyToMode?: ReplyToMode;
  formatting?: OutboundDeliveryFormattingOptions;
  threadId?: string | number | null;
  identity?: OutboundIdentity;
  deps?: OutboundSendDeps;
  mediaAccess?: OutboundMediaAccess;
  gifPlayback?: boolean;
  forceDocument?: boolean;
  replyPayloadSendingHook?: QueuedReplyPayloadSendingHook;
  abortSignal?: AbortSignal;
  bestEffort?: boolean;
  onError?: (err: unknown, payload: NormalizedOutboundPayload) => void;
  onPayload?: (payload: NormalizedOutboundPayload) => void;
  onPayloadDeliveryOutcome?: (outcome: OutboundPayloadDeliveryOutcome) => void;
  session?: OutboundSessionContext;
  mirror?: DeliveryMirror;
  silent?: boolean;
  gatewayClientScopes?: readonly string[];
  queuePolicy?: "required" | "best_effort";
  skipQueue?: boolean;
  renderedBatchPlan?: unknown;
  onDeliveryIntent?: (intent: unknown) => void;
  deferCommitHooks?: boolean;
  onPlatformSendStart?: () => Promise<void>;
}): Promise<OutboundDeliveryResult[]> {
  const { channel, to, payloads } = params;
  const queuePolicy = params.queuePolicy ?? "best_effort";
  const queuePayloads = payloads.map(stripInternalRuntimeScaffolding);
  const renderedBatchPlan = params.renderedBatchPlan ?? createRenderedMessageBatchPlan(params.payloads);
  const queueId = params.skipQueue ? null : await safeQueueAction(
    () => enqueueDelivery({ channel, to, accountId: params.accountId, payloads: queuePayloads, renderedBatchPlan, threadId: params.threadId, replyToId: params.replyToId, replyToMode: params.replyToMode, formatting: params.formatting, identity: params.identity, bestEffort: params.bestEffort, gifPlayback: params.gifPlayback, forceDocument: params.forceDocument, replyPayloadSendingHook: params.replyPayloadSendingHook, silent: params.silent, mirror: params.mirror, session: params.session, gatewayClientScopes: params.gatewayClientScopes }),
    null,
    queuePolicy,
    `failed to enqueue delivery ${channel}/${to}`,
  );
  if (queueId) params.onDeliveryIntent?.({ id: queueId, channel, to, accountId: params.accountId, queuePolicy });
  const claimResult = queueId
    ? await withActiveDeliveryClaim(queueId, () => deliverOutboundPayloadsCore({ ...params, queueId }))
    : { status: "ok" as const, value: await deliverOutboundPayloadsCore({ ...params, queueId: null }) };
  return claimResult.status === "claimed-by-other-owner" ? [] : claimResult.value;
}

async function deliverOutboundPayloadsCore(params: DeliverOutboundPayloadsCoreParams & { queueId: string | null }): Promise<OutboundDeliveryResult[]> {
  const queueId = params;
  const queuePolicy = params.queuePolicy ?? "best_effort";
  let hadPartialFailure = false;
  const wrapOnError = (err: unknown, payload: NormalizedOutboundPayload) => {
    hadPartialFailure = true;
    params.onError?.(err, payload);
  };
  const results: OutboundDeliveryResult[] = [];
  let platformSendStarted = false;
  const onPlatformSendStart = params.onPlatformSendStart ? async () => {
    if (platformSendStarted || !queueId) return;
    platformSendStarted = true;
    await safeQueueAction(
      () => markDeliveryPlatformSendAttemptStarted(queueId),
      false,
      queuePolicy,
      `failed to mark delivery ${queueId} as started`,
    );
  } : undefined;

  try {
    const coreResults = await deliverOutboundPayloadsCoreUnwrapped({ ...params, onError: wrapOnError, onPlatformSendStart });
    results.push(...coreResults);
    if (queueId) {
      if (hadPartialFailure) {
        await failDelivery(queueId, "partial delivery failure").catch(() => {});
      } else {
        if (platformSendStarted) {
          await safeQueueAction(
            () => markDeliveryPlatformOutcomeUnknown(queueId),
            undefined,
            queuePolicy,
            `failed to mark delivery ${queueId} as unknown`,
          );
        }
        const acked = await safeQueueAction(() => ackDelivery(queueId), false, queuePolicy, `failed to ack delivery ${queueId}`);
        if (acked) await runOutboundDeliveryCommitHooks(results);
      }
    }
    return results;
  } catch (err) {
    if (queueId && !isDeliveryAbortError(err)) {
      await failDelivery(queueId, formatErrorMessage(err)).catch(() => {});
    }
    throw err;
  }
}

async function deliverOutboundPayloadsCoreUnwrapped(params: DeliverOutboundPayloadsCoreParams & { onPlatformSendStart?: () => Promise<void> }): Promise<OutboundDeliveryResult[]> {
  const { cfg, channel, to, payloads, accountId, deps, abortSignal } = params;
  const baseHandler = await createChannelHandler(params);
  const normalizedPayloads = normalizePayloadsForChannelDelivery(createOutboundPayloadPlan(payloads, { cfg, sessionKey: params.session?.policyKey ?? params.session?.key, surface: channel, conversationType: params.session?.conversationType }), baseHandler);
  const results: OutboundDeliveryResult[] = [];
  const hookRunner = getGlobalHookRunner();
  const sessionKey = params.mirror?.sessionKey ?? params.session?.key;
  const { emitMessageSent } = createMessageSentEmitter({ hookRunner, channel, to, accountId, sessionKey, mirrorIsGroup: params.mirror?.isGroup, mirrorGroupId: params.mirror?.groupId });

  for (const { payload } of normalizedPayloads) {
    const effectivePayload = await processPayload(payload, params);
    if (!effectivePayload) continue;
    const deliveryHandler = await resolveDeliveryHandler(effectivePayload, params);
    const sendOverrides = buildSendOverrides(effectivePayload, params);
    const beforeCount = results.length;

    try {
      if (shouldUsePayloadSend(deliveryHandler, effectivePayload)) {
        const result = await deliveryHandler.sendPayload(effectivePayload, sendOverrides);
        pushIfIdentified(results, result);
      } else if (hasMedia(effectivePayload)) {
        await sendMediaPayload(deliveryHandler, effectivePayload, sendOverrides, results);
      } else {
        await sendTextPayload(deliveryHandler, effectivePayload, sendOverrides, results);
      }
      const delivered = results.slice(beforeCount);
      if (delivered.length) {
        await maybePin(deliveryHandler, effectivePayload, delivered);
        await maybeAfterDeliver(deliveryHandler, effectivePayload, delivered);
      }
      emitMessageSent({ success: delivered.length > 0, content: effectivePayload.text ?? "", messageId: delivered.at(-1)?.messageId });
    } catch (err) {
      if (!params.bestEffort) throw err;
      params.onError?.(err, summarizeOutboundPayloadForTransport(effectivePayload));
    }
  }
  return results;
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
async function createChannelHandler(params: DeliverOutboundPayloadsCoreParams) {
  const { cfg, channel, to, accountId, deps, replyToId, replyToMode, formatting, threadId, identity, gifPlayback, forceDocument, silent, gatewayClientScopes } = params;
  const outbound = await loadChannelOutboundAdapter(channel);
  const message = resolveOutboundChannelMessageAdapter({ cfg, channel });
  const mediaAccess = resolveAgentScopedOutboundMediaAccess({ cfg, agentId: params.session?.agentId, mediaAccess: params.mediaAccess, sessionKey: params.session?.policyKey, messageProvider: channel, accountId, requesterSenderId: params.session?.requesterSenderId });
  const ctx = { cfg, to, accountId, replyToId, replyToMode, formatting, threadId, identity, gifPlayback, forceDocument, silent, deps, mediaAccess, gatewayClientScopes };
  const sendText = outbound?.sendText || message?.send?.text;
  if (!sendText) throw new Error(`Outbound not configured for channel: ${channel}`);
  return {
    chunker: outbound?.chunker ?? null,
    chunkerMode: outbound?.chunkerMode,
    textChunkLimit: outbound?.textChunkLimit,
    supportsMedia: Boolean(outbound?.sendMedia || message?.send?.media),
    sanitizeText: outbound?.sanitizeText ? (p: ReplyPayload) => outbound.sanitizeText!({ text: p.text ?? "", payload: p }) : undefined,
    normalizePayload: outbound?.normalizePayload ? (p: ReplyPayload) => outbound.normalizePayload!({ payload: p, cfg, accountId }) : undefined,
    sendTextOnlyErrorPayloads: outbound?.sendTextOnlyErrorPayloads === true,
    renderPresentation: outbound?.renderPresentation ? async (p: ReplyPayload) => outbound.renderPresentation!({ payload: p, presentation: normalizeMessagePresentation(p.presentation)!, ctx: { ...ctx, text: p.text ?? "", mediaUrl: p.mediaUrl, payload: p } }) : undefined,
    presentationCapabilities: outbound?.presentationCapabilities,
    pinDeliveredMessage: outbound?.pinDeliveredMessage ? async ({ target, messageId, pin, gatewayClientScopes }) => outbound.pinDeliveredMessage!({ cfg, target, messageId, pin, gatewayClientScopes }) : undefined,
    afterDeliverPayload: outbound?.afterDeliverPayload ? async ({ target, payload, results }) => outbound.afterDeliverPayload!({ cfg, target, payload, results }) : undefined,
    shouldSkipPlainTextSanitization: outbound?.shouldSkipPlainTextSanitization ? (p: ReplyPayload) => outbound.shouldSkipPlainTextSanitization!({ payload: p }) : undefined,
    resolveEffectiveTextChunkLimit: outbound?.resolveEffectiveTextChunkLimit ? (fallback?: number) => outbound.resolveEffectiveTextChunkLimit!({ cfg, accountId: accountId ?? undefined, fallbackLimit: fallback }) : undefined,
    sendPayload: message?.send?.payload || outbound?.sendPayload ? async (p: ReplyPayload, o?: OutboundMessageSendOverrides) => {
      if (message?.send?.payload) {
        const result = await message.send.payload({ ...ctx, kind: "payload", text: p.text ?? "", mediaUrl: p.mediaUrl, payload: p });
        return attachOutboundDeliveryCommitHook(normalizeResult(channel, result), undefined);
      }
      await params.onPlatformSendStart?.();
      return outbound.sendPayload!({ ...ctx, text: p.text ?? "", mediaUrl: p.mediaUrl, payload: p });
    } : undefined,
    sendText: async (text: string, overrides?: OutboundMessageSendOverrides) => {
      const result = message?.send?.text ? await message.send.text({ ...ctx, kind: "text", text }) : await outbound.sendText!({ ...ctx, kind: "text", text });
      return attachOutboundDeliveryCommitHook(normalizeResult(channel, result), undefined);
    },
    sendMedia: async (caption: string, mediaUrl: string, overrides?: OutboundMessageSendOverrides) => {
      const result = message?.send?.media ? await message.send.media({ ...ctx, kind: "media", text: caption, mediaUrl }) : outbound.sendMedia ? await outbound.sendMedia({ ...ctx, kind: "media", text: caption, mediaUrl }) : await outbound.sendText!({ ...ctx, kind: "text", text: caption });
      return attachOutboundDeliveryCommitHook(normalizeResult(channel, result), undefined);
    },
    buildTargetRef: (o?: { threadId?: string | number | null }) => ({ channel, to, accountId, threadId: o?.threadId ?? threadId }),
  } as ChannelHandler;
}

const normalizeResult = (channel: Exclude<OutboundChannel, "none">, result: ChannelMessageSendResult): OutboundDeliveryResult => ({
  ...result,
  channel,
  messageId: result.messageId ?? result.receipt?.primaryPlatformMessageId ?? result.receipt?.platformMessageIds?.[0] ?? "",
  receipt: result.receipt,
});

const createMessageSentEmitter = ({ hookRunner, channel, to, accountId, sessionKey, mirrorIsGroup, mirrorGroupId }) => {
  const hasMessageSentHooks = hookRunner?.hasHooks("message_sent") ?? false;
  const emitMessageSent = (event: { success: boolean; content: string; error?: string; messageId?: string }) => {
    if (!hasMessageSentHooks && !sessionKey) return;
    const canonical = buildCanonicalSentMessageHookContext({ to, content: event.content, success: event.success, error: event.error, channelId: channel, accountId: accountId ?? undefined, conversationId: to, sessionKey, messageId: event.messageId, isGroup: mirrorIsGroup, groupId: mirrorGroupId });
    if (hasMessageSentHooks) fireAndForgetHook(hookRunner.runMessageSent(toPluginMessageSentEvent(canonical), toPluginMessageContext(canonical)), "message_sent hook failed", log.warn);
    if (sessionKey) fireAndForgetHook(triggerInternalHook(createInternalHookEvent("message", "sent", sessionKey, toInternalMessageSentContext(canonical))), "message:sent internal hook failed", log.warn);
  };
  return { emitMessageSent };
};

const normalizePayloadsForChannelDelivery = (plan: readonly OutboundPayloadPlan[], handler: ChannelHandler) => {
  const result: { payload: ReplyPayload }[] = [];
  for (const entry of plan) {
    let payload = stripInternalRuntimeScaffolding(entry.payload);
    if (handler.sanitizeText && payload.text && !handler.shouldSkipPlainTextSanitization?.(payload)) payload = { ...payload, text: handler.sanitizeText(payload) };
    if (handler.normalizePayload) payload = handler.normalizePayload(payload) ?? payload;
    const normalized = normalizeEmptyPayload(payload);
    if (normalized) result.push({ payload: normalized });
  }
  return result;
};

const normalizeEmptyPayload = (payload: ReplyPayload): ReplyPayload | null => {
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text.trim() && !hasReplyPayloadContent({ ...payload, text })) return null;
  return text ? payload : { ...payload, text: "" };
};

const processPayload = async (
  payload: ReplyPayload,
  params: DeliverOutboundPayloadsCoreParams,
): Promise<ReplyPayload | null> => {
  let p = payload;
  if (params.replyPayloadSendingHook) {
    const hookResult = await runReplyPayloadSendingHook({
      payload: p,
      kind: params.replyPayloadSendingHook.kind,
      channel: params.replyPayloadSendingHook.channel,
      sessionKey: params.replyPayloadSendingHook.sessionKey,
      runId: params.replyPayloadSendingHook.runId,
      context: params.replyPayloadSendingHook.context,
    });
    if (!hookResult) return null;
    p = hookResult;
  }
  if (params.mirror && p) {
    try {
      const { appendAssistantMessageToSessionTranscript } = await import(
        "../../config/sessions/transcript.runtime.js"
      );
      const mirrorText = resolveMirroredTranscriptText({
        text: p.text ?? "",
        mediaUrls: p.mediaUrls ?? [],
      });
      if (mirrorText) {
        await appendAssistantMessageToSessionTranscript({
          agentId: params.mirror.agentId,
          sessionKey: params.mirror.sessionKey,
          text: mirrorText,
          idempotencyKey: params.mirror.idempotencyKey,
          config: params.cfg,
        });
      }
    } catch (err) {
      // Mirror failures are non‑fatal — platform send already happened
      log.warn(`mirror failed: ${formatErrorMessage(err)}`, {
        sessionKey: params.mirror.sessionKey,
      });
    }
  }

  return p;
};

const resolveDeliveryHandler = async (params: DeliverOutboundPayloadsCoreParams) => createChannelHandler(params);

const buildSendOverrides = (payload: ReplyPayload, params: DeliverOutboundPayloadsCoreParams): OutboundMessageSendOverrides => ({
  replyToId: params.replyToId ?? undefined,
  threadId: params.threadId ?? undefined,
  audioAsVoice: payload.audioAsVoice === true,
  forceDocument: params.forceDocument,
});

const hasMedia = (payload: ReplyPayload): boolean =>
  Boolean(payload.mediaUrl || (payload.mediaUrls?.length ?? 0) > 0);

const shouldUsePayloadSend = (handler: ChannelHandler, payload: ReplyPayload): boolean =>
  Boolean(handler.sendPayload && ((payload.isError && handler.sendTextOnlyErrorPayloads) || hasReplyPayloadContent({ presentation: payload.presentation, interactive: payload.interactive, channelData: payload.channelData }) || payload.audioAsVoice));

const sendTextPayload = async (handler: ChannelHandler, payload: ReplyPayload, overrides: OutboundMessageSendOverrides, results: OutboundDeliveryResult[]) => {
  const units = planOutboundTextMessageUnits({ text: payload.text ?? "", overrides, chunker: handler.chunker, chunkerMode: handler.chunkerMode, textLimit: handler.resolveEffectiveTextChunkLimit?.() ?? 4096, chunkMode: "length", formatting: undefined, consumeReplyTo: (v) => v });
  for (const unit of units) if (unit.kind === "text") pushIfIdentified(results, await handler.sendText(unit.text, unit.overrides));
};

const sendMediaPayload = async (handler: ChannelHandler, payload: ReplyPayload, overrides: OutboundMessageSendOverrides, results: OutboundDeliveryResult[]) => {
  const units = planOutboundMediaMessageUnits({ mediaUrls: payload.mediaUrls ?? [], caption: payload.text ?? "", overrides, consumeReplyTo: (v) => v });
  for (const unit of units) {
    if (unit.kind === "media") pushIfIdentified(results, await handler.sendMedia(unit.caption ?? "", unit.mediaUrl, unit.overrides));
  }
};

const maybePin = async (handler: ChannelHandler, payload: ReplyPayload, delivered: OutboundDeliveryResult[]) => {
  const pin = normalizePin(payload);
  if (!pin || !handler.pinDeliveredMessage) return;
  const target = handler.buildTargetRef({});
  const messageId = delivered.find(r => r.messageId)?.messageId;
  if (!messageId && pin.required) throw new Error("Delivery pin required, but no message id");
  if (messageId) await handler.pinDeliveredMessage({ target, messageId, pin });
};

const maybeAfterDeliver = async (handler: ChannelHandler, payload: ReplyPayload, delivered: OutboundDeliveryResult[]) => {
  if (handler.afterDeliverPayload && delivered.length) {
    await handler.afterDeliverPayload({ target: handler.buildTargetRef({}), payload, results: delivered });
  }
};