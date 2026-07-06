/** Lazy runtime facade for isolated cron agent execution dependencies. */
export {
  resolveEffectiveModelFallbacks,
  resolveSubagentModelFallbacksOverride,
} from "../../agents/agent-scope.ts";
export { resolveBootstrapWarningSignaturesSeen } from "../../agents/bootstrap-budget.ts";
export { resolveCronAgentLane } from "../../agents/lanes.ts";
export { ensureSelectedAgentHarnessPlugin } from "../../agents/harness/runtime-plugin.ts";
export { LiveSessionModelSwitchError } from "../../agents/live-model-switch-error.ts";
export { runWithModelFallback } from "../../agents/model-fallback.ts";
export { isCliProvider } from "../../agents/model-selection-cli.ts";
export { normalizeVerboseLevel } from "../../auto-reply/thinking.shared.ts";
export { resolveSessionTranscriptPath } from "../../config/sessions/paths.ts";
export { registerAgentRunContext } from "../../infra/agent-events.ts";
export { logWarn } from "../../logger.ts";
import { createLazyImportLoader } from "../../shared/lazy-promise.ts";

const cronExecutionCliRuntimeLoader = createLazyImportLoader(
  () => import("./run-execution-cli.runtime.js"),
);

async function loadCronExecutionCliRuntime() {
  return await cronExecutionCliRuntimeLoader.load();
}

/** Lazily resolves CLI session ids without loading the cron CLI runner at module import time. */
export async function getCliSessionId(
  ...args: Parameters<typeof import("../../agents/cli-session.js").getCliSessionId>
): Promise<ReturnType<typeof import("../../agents/cli-session.js").getCliSessionId>> {
  const runtime = await loadCronExecutionCliRuntime();
  return runtime.getCliSessionId(...args);
}

/** Lazily runs the CLI-backed agent path used by isolated cron execution. */
export async function runCliAgent(
  ...args: Parameters<typeof import("../../agents/cli-runner.js").runCliAgent>
): ReturnType<typeof import("../../agents/cli-runner.js").runCliAgent> {
  const runtime = await loadCronExecutionCliRuntime();
  return runtime.runCliAgent(...args);
}
