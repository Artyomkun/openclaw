/**
 * Dispatches embedded attempts to native harness or OpenClaw backend execution.
 */
import { runAgentHarnessAttempt } from "../../harness/selection.ts";
import type { EmbeddedRunAttemptParams, EmbeddedRunAttemptResult } from "./types.ts";

/**
 * Backend bridge for executing one embedded-agent attempt through the selected harness.
 */
export async function runEmbeddedAttemptWithBackend(
  params: EmbeddedRunAttemptParams,
): Promise<EmbeddedRunAttemptResult> {
  return runAgentHarnessAttempt(params);
}
