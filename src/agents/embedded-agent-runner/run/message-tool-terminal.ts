import type { SourceReplyDeliveryMode } from "../../../auto-reply/get-reply-options.types.ts";
/**
 * Detects message-tool-only sends that delivered a visible source reply.
 */
import { isDeliveredMessageToolOnlySourceReplyResult } from "../../embedded-agent-message-tool-source-reply.ts";
import type { AfterToolCallContext, AfterToolCallResult, Agent } from "../../runtime/index.ts";

function argsRecordForToolCall(context: AfterToolCallContext): Record<string, unknown> {
  if (context.args && typeof context.args === "object" && !Array.isArray(context.args)) {
    return context.args as Record<string, unknown>;
  }
  const fallbackArgs = context.toolCall.arguments;
  return fallbackArgs && typeof fallbackArgs === "object" && !Array.isArray(fallbackArgs)
    ? fallbackArgs
    : {};
}

/**
 * Determines whether a `message.send` tool call delivered a visible source reply
 * in message-tool-only delivery mode. Only implicit-route, non-dry-run,
 * delivered sends qualify; explicit routes and errors are not source replies.
 */
export function isDeliveredMessageToolOnlySourceReply(params: {
  sourceReplyDeliveryMode?: SourceReplyDeliveryMode;
  context: AfterToolCallContext;
  hookResult?: AfterToolCallResult;
}): boolean {
  return isDeliveredMessageToolOnlySourceReplyResult({
    sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
    toolName: params.context.toolCall.name,
    args: argsRecordForToolCall(params.context),
    result: params.context.result,
    hookResult: params.hookResult,
    isError: params.hookResult?.isError ?? params.context.isError,
  });
}

/** Installs an after-tool hook that records source reply delivery evidence. */
export function installMessageToolOnlyTerminalHook(params: {
  agent: Agent;
  sourceReplyDeliveryMode?: SourceReplyDeliveryMode;
  onDeliveredSourceReply?: () => void;
}): void {
  if (params.sourceReplyDeliveryMode !== "message_tool_only") {
    return;
  }
  const previousAfterToolCall = params.agent.afterToolCall?.bind(params.agent);
  params.agent.afterToolCall = async (context, signal) => {
    const hookResult = await previousAfterToolCall?.(context, signal);
    if (
      isDeliveredMessageToolOnlySourceReply({
        sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
        context,
        hookResult,
      })
    ) {
      params.onDeliveredSourceReply?.();
      return hookResult;
    }
    return hookResult;
  };
}
