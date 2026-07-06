// Gateway command-lane concurrency applier.
// Pushes config-derived agent/cron limits into the process command queue.
import { resolveAgentMaxConcurrent, resolveSubagentMaxConcurrent } from "../config/agent-limits.ts";
import { resolveCronMaxConcurrentRuns } from "../config/cron-limits.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { setCommandLaneConcurrency } from "../process/command-queue.ts";
import { CommandLane } from "../process/lanes.ts";

export function applyGatewayLaneConcurrency(cfg: OpenClawConfig) {
  const cronMaxConcurrentRuns = resolveCronMaxConcurrentRuns(cfg.cron);
  setCommandLaneConcurrency(CommandLane.Cron, cronMaxConcurrentRuns);
  // Cron isolated agent turns remap inner LLM work to this lane.
  setCommandLaneConcurrency(CommandLane.CronNested, cronMaxConcurrentRuns);
  setCommandLaneConcurrency(CommandLane.Main, resolveAgentMaxConcurrent(cfg));
  setCommandLaneConcurrency(CommandLane.Subagent, resolveSubagentMaxConcurrent(cfg));
}
