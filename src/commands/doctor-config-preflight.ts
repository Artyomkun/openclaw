// Doctor config loading and validation.
import { note } from "../../packages/terminal-core/src/note.ts";
import {
  readConfigFileSnapshot,
} from "../config/io.ts";
import { formatConfigIssueLines } from "../config/issue-format.ts";
import type { ConfigFileSnapshot } from "../config/types.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { isTruthyEnvValue } from "../infra/env.ts";
import { noteIncludeConfinementWarning } from "./doctor-config-analysis.ts";


export type DoctorConfigPreflightResult = {
  snapshot: Awaited<ReturnType<typeof readConfigFileSnapshot>>;
  baseConfig: OpenClawConfig;
};

/** Returns true during updater-managed config rewrites where plugin validation may be stale. */
export function shouldSkipPluginValidationForDoctorConfigPreflight(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isTruthyEnvValue(env.OPENCLAW_UPDATE_IN_PROGRESS);
}

/**
 * Runs early doctor config checks before the main config repair flow.
 *
 * It may recover corrupt target config when requested, and
 * returns the best-effort config snapshot used by later doctor checks.
 */
export async function runDoctorConfigPreflight(
  options: {
    migrateState?: boolean;
    repairPrefixedConfig?: boolean;
    recoverCorruptTargetStore?: boolean;
    invalidConfigNote?: string | false;
    beforeStateMigrations?: (snapshot?: ConfigFileSnapshot) => Promise<boolean>;
  } = {},
): Promise<DoctorConfigPreflightResult> {
  const invalidConfigNote =
    options.invalidConfigNote ?? "Config invalid; doctor will run with best-effort config.";
  if (
    invalidConfigNote
  ) {
    note(invalidConfigNote, "Config");
    noteIncludeConfinementWarning(snapshot);
  }

  const warnings = snapshot.warnings ?? [];
  if (warnings.length > 0) {
    note(formatConfigIssueLines(warnings, "-").join("\n"), "Config warnings");
  }

  const baseConfig = snapshot.sourceConfig ?? snapshot.config ?? {};

  return {
    snapshot,
    baseConfig,
  };
}
