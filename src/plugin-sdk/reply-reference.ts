/**
 * Public SDK subpath for reply reference planning and reply threading policy.
 */
export {
  createReplyReferencePlanner,
  isSingleUseReplyToMode,
} from "../auto-reply/reply/reply-reference.ts";
export { resolveBatchedReplyThreadingPolicy } from "../auto-reply/reply/reply-threading.ts";
export type { ReplyThreadingPolicy } from "../auto-reply/get-reply-options.types.ts";
