// Lazy lifecycle runtime export hub used by gateway run-loop restart paths.
export {
  abortEmbeddedAgentRun,
  getActiveEmbeddedRunCount,
  listActiveEmbeddedRunSessionIds,
  listActiveEmbeddedRunSessionKeys,
  waitForActiveEmbeddedRuns,
} from "../../agents/embedded-agent-runner/runs.ts";
export { markRestartAbortedMainSessions } from "../../agents/main-session-restart-recovery.ts";
export { getRuntimeConfig } from "../../config/config.ts";
export {
  respawnGatewayProcessForUpdate,
  restartGatewayProcessWithFreshPid,
} from "../../infra/process-respawn.ts";
export {
  resolveGatewayRestartDeferralTimeoutMs,
  consumeGatewayRestartIntentPayloadSync,
  consumeGatewaySigusr1RestartIntent,
  consumeGatewayRestartIntentSync,
  consumeGatewaySigusr1RestartAuthorization,
  isGatewaySigusr1RestartExternallyAllowed,
  markGatewaySigusr1RestartHandled,
  peekGatewaySigusr1RestartReason,
  resetGatewayRestartStateForInProcessRestart,
  scheduleGatewaySigusr1Restart,
} from "../../infra/restart.ts";
export { writeGatewayRestartHandoffSync } from "../../infra/restart-handoff.ts";
export { rotateAgentEventLifecycleGeneration } from "../../infra/agent-events.ts";
export { markUpdateRestartSentinelFailure } from "../../infra/restart-sentinel.ts";
export { detectRespawnSupervisor } from "../../infra/supervisor-markers.ts";
export { writeDiagnosticStabilityBundleForFailureSync } from "../../logging/diagnostic-stability-bundle.ts";
export {
  advanceCronActiveJobGeneration,
  resetCronActiveJobs,
  waitForActiveCronJobs,
} from "../../cron/active-jobs.ts";
export {
  abortActiveCronTaskRuns,
  retireActiveCronTaskRunTracking,
  waitForActiveCronTaskRuns,
} from "../../tasks/cron-task-cancel.ts";
export {
  getActiveTaskCount,
  markGatewayDraining,
  resetAllLanes,
  waitForActiveTasks,
} from "../../process/command-queue.ts";
export { getInspectableActiveTaskRestartBlockers } from "../../tasks/task-registry.maintenance.ts";
export { reloadTaskRegistryFromStore } from "../../tasks/runtime-internal.ts";
