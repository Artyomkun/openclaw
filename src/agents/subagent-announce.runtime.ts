/**
 * Runtime dependency barrel for subagent announcement/output collection.
 *
 * Keeping these imports behind one module lets tests replace gateway/session
 * IO without changing the announce logic itself.
 */
export { getRuntimeConfig } from "../config/config.ts";
export {
  loadSessionStore,
  readSessionEntry,
  resolveAgentIdFromSessionKey,
  resolveStorePath,
} from "../config/sessions.ts";
export { callGateway } from "../gateway/call.ts";
export { readSessionMessagesAsync } from "../gateway/session-transcript-readers.ts";
export { dispatchGatewayMethodInProcess } from "../gateway/server-plugins.ts";
export {
  isEmbeddedAgentRunActive,
  waitForEmbeddedAgentRunEnd,
} from "./embedded-agent-runner/runs.ts";
