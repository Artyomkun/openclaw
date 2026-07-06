// Shared provider dispatch type contracts for reply runtime execution.
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { GetReplyOptions } from "../get-reply-options.types.ts";
import type { FinalizedMsgContext, MsgContext } from "../templating.ts";
import type { DispatchFromConfigResult } from "./dispatch-from-config.types.ts";
import type { GetReplyFromConfig } from "./get-reply.types.ts";
import type {
  ReplyDispatcherOptions,
  ReplyDispatcherWithTypingOptions,
} from "./reply-dispatcher.ts";

type DispatchReplyContext = MsgContext | FinalizedMsgContext;
type DispatchReplyOptions = Omit<GetReplyOptions, "onBlockReply">;

/** Buffered block dispatcher entry point used by provider reply flows. */
export type DispatchReplyWithBufferedBlockDispatcher = (params: {
  ctx: DispatchReplyContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  toolsAllow?: string[];
  replyOptions?: DispatchReplyOptions;
  replyResolver?: GetReplyFromConfig;
}) => Promise<DispatchFromConfigResult>;

/** Plain dispatcher entry point used when block buffering is not needed. */
export type DispatchReplyWithDispatcher = (params: {
  ctx: DispatchReplyContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  toolsAllow?: string[];
  replyOptions?: DispatchReplyOptions;
  replyResolver?: GetReplyFromConfig;
}) => Promise<DispatchFromConfigResult>;
