/**
 * Runtime facade for subagent registry reads and steer updates.
 *
 * Announcement and control paths import this narrow surface so tests can mock
 * registry behavior without loading the full mutable registry module.
 */
export {
  countActiveDescendantRuns,
  getLatestSubagentRunByChildSessionKey,
} from "./subagent-registry-read.ts";
export {
  countPendingDescendantRuns,
  countPendingDescendantRunsExcludingRun,
  isSubagentSessionRunActive,
  listSubagentRunsForRequester,
  resolveRequesterForChildSession,
  shouldIgnorePostCompletionAnnounceForSession,
} from "./subagent-registry-announce-read.ts";
export { replaceSubagentRunAfterSteer } from "./subagent-registry-steer-runtime.ts";
