// Shared agent/reply runtime helpers for channel plugins. Keep channel plugins
// off direct src/auto-reply imports by routing common reply primitives here.

export {
  chunkMarkdownText,
  chunkMarkdownTextWithMode,
  chunkText,
  chunkTextWithMode,
  resolveChunkMode,
  resolveTextChunkLimit,
} from "../auto-reply/chunk.ts";
export type { ChunkMode } from "../auto-reply/chunk.ts";
export {
  dispatchInboundMessage,
  dispatchInboundMessageWithBufferedDispatcher,
  dispatchInboundMessageWithDispatcher,
  settleReplyDispatcher,
} from "../auto-reply/dispatch.ts";
export {
  normalizeGroupActivation,
  parseActivationCommand,
} from "../auto-reply/group-activation.ts";
export {
  HEARTBEAT_PROMPT,
  DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  resolveHeartbeatPrompt,
  stripHeartbeatToken,
} from "../auto-reply/heartbeat.ts";
export { resolveHeartbeatReplyPayload } from "../auto-reply/heartbeat-reply-payload.ts";
export { getReplyFromConfig } from "../auto-reply/reply/get-reply.ts";
export { HEARTBEAT_TOKEN, isSilentReplyText, SILENT_REPLY_TOKEN } from "../auto-reply/tokens.ts";
export { isAbortRequestText } from "../auto-reply/reply/abort.ts";
export { isBtwRequestText } from "../auto-reply/reply/btw-command.ts";
export { resetInboundDedupe } from "../auto-reply/reply/inbound-dedupe.ts";
export { finalizeInboundContext } from "../auto-reply/reply/inbound-context.ts";
export {
  createInboundDebouncer,
  resolveInboundDebounceMs,
} from "../auto-reply/inbound-debounce.ts";
export {
  dispatchReplyWithBufferedBlockDispatcher,
  dispatchReplyWithDispatcher,
} from "../auto-reply/reply/provider-dispatcher.ts";
export {
  createReplyDispatcher,
  createReplyDispatcherWithTyping,
} from "../auto-reply/reply/reply-dispatcher.ts";
export type {
  ReplyDispatchKind,
  ReplyDispatcher,
  ReplyFollowupAdmissionBarrierTimeoutPolicy,
} from "../auto-reply/reply/reply-dispatcher.types.ts";
export type {
  ReplyDispatcherOptions,
  ReplyDispatcherWithTypingOptions,
} from "../auto-reply/reply/reply-dispatcher.ts";
export { createReplyReferencePlanner } from "../auto-reply/reply/reply-reference.ts";
export type {
  GetReplyOptions,
  BlockReplyContext,
  SourceReplyDeliveryMode,
} from "../auto-reply/get-reply-options.types.ts";
export type { ReplyPayload } from "./reply-payload.ts";
export type { FinalizedMsgContext, MsgContext } from "../auto-reply/templating.ts";
export type { CommandTurnContext } from "../auto-reply/command-turn-context.ts";
export { generateConversationLabel } from "../auto-reply/reply/conversation-label-generator.ts";
export type { ConversationLabelParams } from "../auto-reply/reply/conversation-label-generator.ts";
