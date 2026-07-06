// Shared abort runtime types for cancellation and cutoff persistence.
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { FinalizedMsgContext } from "../templating.ts";

/** Result from the fast abort path before normal reply dispatch starts. */
type FastAbortResult = {
  handled: boolean;
  aborted: boolean;
  stoppedSubagents?: number;
};

/** Runtime hook that may convert a message into an immediate abort action. */
export type TryFastAbortFromMessage = (params: {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
}) => Promise<FastAbortResult>;

/** Formats the user-visible abort acknowledgement text. */
export type FormatAbortReplyText = (stoppedSubagents?: number) => string;
