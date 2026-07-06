/** Runtime facade for compact command dependencies. */
export {
  abortEmbeddedAgentRun,
  compactEmbeddedAgentSession,
  isEmbeddedAgentRunAbortableForCompaction,
  waitForEmbeddedAgentRunEnd,
} from "../../agents/embedded-agent.ts";
export {
  resolveFreshSessionTotalTokens,
  resolveSessionFilePath,
  resolveSessionFilePathOptions,
} from "../../config/sessions.ts";
export { enqueueSystemEvent } from "../../infra/system-events.ts";
export { formatContextUsageShort, formatTokenCount } from "../status.ts";
export { incrementCompactionCount } from "./session-updates.ts";
