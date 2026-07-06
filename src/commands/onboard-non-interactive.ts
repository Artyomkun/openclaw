/**
 * Non-interactive onboarding command dispatcher.
 *
 * This module validates the existing config snapshot, routes local/remote
 * setup, and handles explicit migration imports without interactive prompts.
 */
import { formatCliCommand } from "../cli/command-format.ts";
import { replaceConfigFile } from "../config/config.ts";
import { readConfigFileSnapshot } from "../config/io.ts";
import { logConfigUpdated } from "../config/logging.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import type { RuntimeEnv } from "../runtime.ts";
import { defaultRuntime } from "../runtime.ts";
import { createNonInteractiveLoggingPrompter } from "./non-interactive-prompter.ts";
import { runNonInteractiveLocalSetup } from "./onboard-non-interactive/local.ts";
import { runNonInteractiveRemoteSetup } from "./onboard-non-interactive/remote.ts";
import type { OnboardOptions } from "./onboard-types.ts";

/** Runs a setup migration import with non-interactive prompt failures. */
async function runNonInteractiveMigrationImport(params: {
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  baseConfig: OpenClawConfig;
  baseHash?: string;
}) {
  const providerId = params.opts.importFrom?.trim();
  if (!providerId) {
    // Migration import cannot safely prompt in non-interactive mode; require the
    // provider id so the import path is deterministic.
    params.runtime.error(
      `--import-from is required for non-interactive migration import. Run ${formatCliCommand("openclaw migrate list")} to choose a provider.`,
    );
    params.runtime.exit(1);
    return;
  }
  const { detectSetupMigrationSources, runSetupMigrationImport } =
    await import("../wizard/setup.migration-import.js");
  const detections = await detectSetupMigrationSources({
    config: params.baseConfig,
    runtime: params.runtime,
  });
  await runSetupMigrationImport({
    opts: { ...params.opts, importFrom: providerId, nonInteractive: true },
    baseConfig: params.baseConfig,
    detections,
    prompter: createNonInteractiveLoggingPrompter(
      params.runtime,
      (message) =>
        `Non-interactive migration import needs explicit flags before prompting: ${message}`,
    ),
    runtime: params.runtime,
    async commitConfigFile(config) {
      await replaceConfigFile({
        nextConfig: config,
        ...(params.baseHash !== undefined ? { baseHash: params.baseHash } : {}),
        writeOptions: { allowConfigSizeDrop: true },
      });
      logConfigUpdated(params.runtime);
      return config;
    },
  });
}

/** Runs non-interactive onboarding in local, remote, or migration-import mode. */
export async function runNonInteractiveSetup(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const snapshot = await readConfigFileSnapshot();
  if (snapshot.exists && !snapshot.valid) {
    // Avoid rewriting an invalid config snapshot; doctor owns recovery so setup
    // does not erase malformed user state.
    runtime.error(
      `Config invalid. Run \`${formatCliCommand("openclaw doctor")}\` to repair it, then re-run setup.`,
    );
    runtime.exit(1);
    return;
  }

  const baseConfig: OpenClawConfig = snapshot.valid
    ? snapshot.exists
      ? (snapshot.sourceConfig ?? snapshot.config)
      : {}
    : {};
  const mode = opts.mode ?? "local";
  if (mode !== "local" && mode !== "remote") {
    runtime.error(
      `Invalid --mode "${String(mode)}". Use "local" or "remote", or run ${formatCliCommand("openclaw onboard")} for interactive setup.`,
    );
    runtime.exit(1);
    return;
  }

  if (opts.importFrom || opts.importSource || opts.importSecrets || opts.flow === "import") {
    // Import flow owns its own commit path because migrations may intentionally
    // shrink older config after extracting credentials.
    await runNonInteractiveMigrationImport({ opts, runtime, baseConfig, baseHash: snapshot.hash });
    return;
  }

  if (mode === "remote") {
    await runNonInteractiveRemoteSetup({ opts, runtime, baseConfig, baseHash: snapshot.hash });
    return;
  }

  await runNonInteractiveLocalSetup({ opts, runtime, baseConfig, baseHash: snapshot.hash });
}
