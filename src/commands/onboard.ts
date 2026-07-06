/**
 * Top-level `openclaw onboard` command entrypoint.
 *
 * It validates global setup flags, performs optional reset handling, and then
 * routes to interactive or non-interactive onboarding.
 */
import { formatCliCommand } from "../cli/command-format.ts";
import { readConfigFileSnapshot } from "../config/config.ts";
import { assertSupportedRuntime } from "../infra/runtime-guard.ts";
import type { RuntimeEnv } from "../runtime.ts";
import { defaultRuntime } from "../runtime.ts";
import { resolveUserPath } from "../utils.ts";
import { DEFAULT_WORKSPACE, handleReset } from "./onboard-helpers.ts";
import { runInteractiveSetup } from "./onboard-interactive.ts";
import { runNonInteractiveSetup } from "./onboard-non-interactive.ts";
import type { OnboardOptions, ResetScope } from "./onboard-types.ts";

const VALID_RESET_SCOPES = new Set<ResetScope>(["config", "config+creds+sessions", "full"]);

/** Runs the onboard command after normalizing older flags and setup mode. */
export async function setupWizardCommand(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  assertSupportedRuntime(runtime);
  const flow = opts.flow === "manual" ? ("advanced" as const) : opts.flow;
  const normalizedOpts =
    flow === opts.flow
      ? opts
      : { ...opts, flow };
  if (
    normalizedOpts.secretInputMode &&
    normalizedOpts.secretInputMode !== "plaintext" && // pragma: allowlist secret
    normalizedOpts.secretInputMode !== "ref" // pragma: allowlist secret
  ) {
    runtime.error(
      `Invalid --secret-input-mode. Use "plaintext" or "ref", or run ${formatCliCommand("openclaw onboard")} for the interactive setup.`,
    );
    runtime.exit(1);
    return;
  }

  if (normalizedOpts.resetScope && !VALID_RESET_SCOPES.has(normalizedOpts.resetScope)) {
    runtime.error(
      `Invalid --reset-scope. Use "config", "config+creds+sessions", or "full". Run ${formatCliCommand("openclaw onboard --reset --reset-scope config")} for a config-only reset.`,
    );
    runtime.exit(1);
    return;
  }

  if (normalizedOpts.nonInteractive && normalizedOpts.acceptRisk !== true) {
    // Non-interactive setup can write credentials and daemon config without a
    // prompt, so the operator must acknowledge the security docs explicitly.
    runtime.error(
      [
        "Non-interactive setup requires explicit risk acknowledgement.",
        "Read: https://docs.openclaw.ai/security",
        `Re-run with: ${formatCliCommand("openclaw onboard --non-interactive --accept-risk ...")}`,
      ].join("\n"),
    );
    runtime.exit(1);
    return;
  }

  if (normalizedOpts.reset) {
    // Reset runs before setup mode dispatch so both interactive and
    // non-interactive setup start from the same cleaned state.
    const snapshot = await readConfigFileSnapshot();
    const baseConfig = snapshot.valid ? (snapshot.sourceConfig ?? snapshot.config) : {};
    const workspaceDefault =
      normalizedOpts.workspace ?? baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE;
    const resetScope: ResetScope = normalizedOpts.resetScope ?? "config+creds+sessions";
    await handleReset(resetScope, resolveUserPath(workspaceDefault), runtime);
  }

  if (process.platform === "win32") {
    runtime.log(
      [
        "Windows detected - OpenClaw runs great on WSL2!",
        "Native Windows might be trickier.",
        "Quick setup: wsl --install (one command, one reboot)",
        "Guide: https://docs.openclaw.ai/windows",
      ].join("\n"),
    );
  }

  if (normalizedOpts.nonInteractive) {
    await runNonInteractiveSetup(normalizedOpts, runtime);
    return;
  }

  await runInteractiveSetup(normalizedOpts, runtime);
}

export const onboardCommand = setupWizardCommand;
