// Shared type contracts for dispatch-from-config runtime execution.
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { SourceReplyDeliveryMode } from "../get-reply-options.types.ts";
import type { FinalizedMsgContext } from "../templating.ts";
import type { FormatAbortReplyText, TryFastAbortFromMessage } from "./abort.runtime-types.ts";
import type { CommandSessionMetadataChange } from "./command-session-metadata.ts";
import type { InternalGetReplyFromConfig, InternalGetReplyOptions } from "./get-reply.types.ts";
import type { ReplyDispatchKind, ReplyDispatcher } from "./reply-dispatcher.types.ts";

export type DispatchFromConfigResult = {
  queuedFinal: boolean;
  counts: Record<ReplyDispatchKind, number>;
  failedCounts?: Partial<Record<ReplyDispatchKind, number>>;
  sourceReplyDeliveryMode?: SourceReplyDeliveryMode;
  sendPolicyDenied?: boolean;
  observedReplyDelivery?: boolean;
  noVisibleReplyFallbackEligible?: boolean;
  beforeAgentRunBlocked?: boolean;
  sessionMetadataChanges?: CommandSessionMetadataChange[];
};

export type DispatchFromConfigParams = {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<InternalGetReplyOptions, "onBlockReply">;
  replyResolver?: InternalGetReplyFromConfig;
  onSessionMetadataChanges?: (changes: CommandSessionMetadataChange[]) => void;
  fastAbortResolver?: TryFastAbortFromMessage;
  formatAbortReplyTextResolver?: FormatAbortReplyText;
  /** Optional patch applied to the already loaded config before reply resolution. */
  configOverride?: OpenClawConfig;
};

export type DispatchReplyFromConfig = (
  params: DispatchFromConfigParams,
) => Promise<DispatchFromConfigResult>;
