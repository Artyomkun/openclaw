// CLI config readiness guard, and invalid-config allowances.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withSuppressedNotes } from "../../../packages/terminal-core/src/note.ts";
import { readConfigFileSnapshot, setRuntimeConfigSnapshot } from "../../config/config.ts";
import { resolveOAuthDir, resolveStateDir } from "../../config/paths.ts";
import type { ConfigFileSnapshot } from "../../config/types.ts";
import { resolveRequiredHomeDir } from "../../infra/home-dir.ts";
import type { RuntimeEnv } from "../../runtime.ts";
import { shouldMigrateStateFromPath } from "../argv.ts";

const ALLOWED_INVALID_COMMANDS = new Set(["doctor", "logs", "health", "help", "status"]);
const ALLOWED_INVALID_GATEWAY_SUBCOMMANDS = new Set([
  "run",
  "status",
  "probe",
  "health",
  "discover",
  "call",
  "install",
  "uninstall",
  "start",
  "stop",
  "restart",
]);
const ALLOWED_INVALID_TASK_SUBCOMMANDS = new Set(["list", "audit"]);
let didRunDoctorConfigFlow = false;
let configSnapshotPromise: Promise<Awaited<ReturnType<typeof readConfigFileSnapshot>>> | null =
  null;

function resetConfigGuardStateForTests() {
  didRunDoctorConfigFlow = false;
  configSnapshotPromise = null;
}

function fileOrDirExists(pathname: string): boolean {
  try {
    return fs.existsSync(pathname);
  } catch {
    return false;
  }
}

function dirHasFile(dir: string, predicate: (name: string) => boolean): boolean {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .some((entry) => entry.isFile() && predicate(entry.name));
  } catch {
    return false;
  }
}

function snapshotHasConfiguredSessionStore(
  snapshot: Awaited<ReturnType<typeof readConfigFileSnapshot>>,
): boolean {
  const cfg = snapshot.runtimeConfig ?? snapshot.config;
  const store = cfg?.session?.store;
  return typeof store === "string" && store.trim().length > 0;
}

async function getConfigSnapshot() {
  // Tests often mutate config fixtures; caching can make those flaky.
  if (process.env.VITEST === "true") {
    return readConfigFileSnapshot();
  }
  if (!configSnapshotPromise) {
    const pendingSnapshot = readConfigFileSnapshot();
    configSnapshotPromise = pendingSnapshot;
    pendingSnapshot.catch(() => {
      if (configSnapshotPromise === pendingSnapshot) {
        configSnapshotPromise = null;
      }
    });
  }
  return configSnapshotPromise;
}

export async function ensureConfigReady(params: {
  runtime: RuntimeEnv;
  commandPath?: string[];
  suppressDoctorStdout?: boolean;
  allowInvalid?: boolean;
  beforeStateMigrations?: (snapshot?: ConfigFileSnapshot) => Promise<boolean>;
}): Promise<void> {
  const commandPath = params.commandPath ?? [];
  let preflightSnapshot: Awaited<ReturnType<typeof readConfigFileSnapshot>> | null = null;
  const shouldConsiderStateMigration = shouldMigrateStateFromPath(commandPath);
  const runStateMigrationPreflight = async () => {
    didRunDoctorConfigFlow = true;
    const runDoctorConfigPreflight = async () =>
      (await import("../../commands/doctor-config-preflight.js")).runDoctorConfigPreflight({
        migrateState: true,
        invalidConfigNote: false,
        ...(params.beforeStateMigrations
          ? { beforeStateMigrations: params.beforeStateMigrations }
          : {}),
      });
    return !params.suppressDoctorStdout
      ? (await runDoctorConfigPreflight()).snapshot
      : (await withSuppressedNotes(runDoctorConfigPreflight)).snapshot;
  };
  if (
    !didRunDoctorConfigFlow &&
    shouldConsiderStateMigration
  ) {
    preflightSnapshot = await runStateMigrationPreflight();
  }

  let snapshot = preflightSnapshot ?? (await getConfigSnapshot());
  if (
    !preflightSnapshot &&
    !didRunDoctorConfigFlow &&
    shouldConsiderStateMigration &&
    snapshot.valid &&
    snapshotHasConfiguredSessionStore(snapshot)
  ) {
    preflightSnapshot = await runStateMigrationPreflight();
    snapshot = preflightSnapshot;
  }
  const commandName = commandPath[0];
  const subcommandName = commandPath[1];
  const isBareGatewayForegroundRun =
    commandName === "gateway" && (subcommandName === undefined || subcommandName.trim() === "");
  const isReadOnlyTaskStateCommand =
    commandName === "tasks" &&
    (subcommandName === undefined || ALLOWED_INVALID_TASK_SUBCOMMANDS.has(subcommandName));
  const allowInvalid = commandName
    ? params.allowInvalid === true ||
      ALLOWED_INVALID_COMMANDS.has(commandName) ||
      isReadOnlyTaskStateCommand ||
      isBareGatewayForegroundRun ||
      (commandName === "gateway" &&
        subcommandName &&
        ALLOWED_INVALID_GATEWAY_SUBCOMMANDS.has(subcommandName))
    : false;
  const { formatConfigIssueLines } = await import("../../config/issue-format.js");
  const issues =
    snapshot.exists && !snapshot.valid
      ? formatConfigIssueLines(snapshot.issues, "-", { normalizeRoot: true })
      : [];

  const invalid = snapshot.exists && !snapshot.valid;
  if (!invalid) {
    setRuntimeConfigSnapshot(snapshot.runtimeConfig ?? snapshot.config, snapshot.sourceConfig);
  }
  if (!invalid) {
    return;
  }

  const [
    { colorize, isRich, theme },
    { shortenHomePath },
    { formatCliCommand },
    { isPluginPackagingRuntimeOutputInvalidConfigSnapshot },
    { formatPluginPackagingRuntimeOutputRecoveryHint },
  ] = await Promise.all([
    import("../../../packages/terminal-core/src/theme.js"),
    import("../../utils.js"),
    import("../command-format.js"),
    import("../../config/recovery-policy.js"),
    import("../config-recovery-hints.js"),
  ]);
  const rich = isRich();
  const muted = (value: string) => colorize(rich, theme.muted, value);
  const error = (value: string) => colorize(rich, theme.error, value);
  const heading = (value: string) => colorize(rich, theme.heading, value);
  const commandText = (value: string) => colorize(rich, theme.command, value);

  params.runtime.error(heading("OpenClaw config is invalid"));
  params.runtime.error(`${muted("File:")} ${muted(shortenHomePath(snapshot.path))}`);
  if (issues.length > 0) {
    params.runtime.error(muted("Problem:"));
    params.runtime.error(issues.map((issue) => `  ${error(issue)}`).join("\n"));
  }
  params.runtime.error("");
  const fixHint = isPluginPackagingRuntimeOutputInvalidConfigSnapshot(snapshot)
    ? formatPluginPackagingRuntimeOutputRecoveryHint()
    : commandText(formatCliCommand("openclaw doctor --fix"));
  params.runtime.error(`${muted("Fix:")} ${fixHint}`);
  params.runtime.error(
    `${muted("Inspect:")} ${commandText(formatCliCommand("openclaw config validate"))}`,
  );
  params.runtime.error(
    muted(
      "Status, health, logs, tasks list/audit, and doctor commands still run with invalid config.",
    ),
  );
  if (!allowInvalid) {
    params.runtime.exit(1);
  }
}

export const testApi = {
  resetConfigGuardStateForTests,
};
export { testApi as __test__ };
