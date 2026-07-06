// Matrix plugin module implements doctor behavior.
import type { ChannelDoctorAdapter } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  detectPluginInstallPathIssue,
  formatPluginInstallPathIssue,
  removePluginFromConfig,
} from "openclaw/plugin-sdk/runtime-doctor";
import {
  normalizeCompatibilityConfig as normalizeMatrixCompatibilityConfig,
} from "./doctor-contract.js";
import {
  maybeCreateMatrixMigrationSnapshot,
  resolveMatrixMigrationStatus,
} from "./matrix-migration.runtime.js";
import { isRecord } from "./record-shared.js";

function hasConfiguredMatrixChannel(cfg: OpenClawConfig): boolean {
  const channels = cfg.channels as Record<string, unknown> | undefined;
  return isRecord(channels?.matrix);
}

function hasConfiguredMatrixPluginSurface(cfg: OpenClawConfig): boolean {
  return Boolean(
    cfg.plugins?.installs?.matrix ||
    cfg.plugins?.entries?.matrix ||
    cfg.plugins?.allow?.includes("matrix") ||
    cfg.plugins?.deny?.includes("matrix"),
  );
}

function hasConfiguredMatrixEnv(env: NodeJS.ProcessEnv): boolean {
  return Object.entries(env).some(
    ([key, value]) => key.startsWith("MATRIX_") && typeof value === "string" && value.trim(),
  );
}

function configMayNeedMatrixDoctorSequence(cfg: OpenClawConfig, env: NodeJS.ProcessEnv): boolean {
  return (
    hasConfiguredMatrixChannel(cfg) ||
    hasConfiguredMatrixPluginSurface(cfg) ||
    hasConfiguredMatrixEnv(env)
  );
}

export async function collectMatrixInstallPathWarnings(cfg: OpenClawConfig): Promise<string[]> {
  const issue = await detectPluginInstallPathIssue({
    pluginId: "matrix",
    install: cfg.plugins?.installs?.matrix,
  });
  if (!issue) {
    return [];
  }
  return formatPluginInstallPathIssue({
    issue,
    pluginLabel: "Matrix",
    defaultInstallCommand: "openclaw plugins install @openclaw/matrix",
  }).map((entry) => `- ${entry}`);
}

export async function cleanStaleMatrixPluginConfig(cfg: OpenClawConfig) {
  const issue = await detectPluginInstallPathIssue({
    pluginId: "matrix",
    install: cfg.plugins?.installs?.matrix,
  });
  if (!issue || issue.kind !== "missing-path") {
    return { config: cfg, changes: [] };
  }
  const { config, actions } = removePluginFromConfig(cfg, "matrix");
  const removed: string[] = [];
  if (actions.install) {
    removed.push("install record");
  }
  if (actions.loadPath) {
    removed.push("load path");
  }
  if (actions.entry) {
    removed.push("plugin entry");
  }
  if (actions.allowlist) {
    removed.push("allowlist entry");
  }
  if (removed.length === 0) {
    return { config: cfg, changes: [] };
  }
  return {
    config,
    changes: [
      `Removed stale Matrix plugin references (${removed.join(", ")}). The previous install path no longer exists: ${issue.path}`,
    ],
  };
}

export async function applyMatrixDoctorRepair(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
}): Promise<{ changes: string[]; warnings: string[] }> {
  const changes: string[] = [];
  const warnings: string[] = [];
  const migrationStatus = resolveMatrixMigrationStatus({
    cfg: params.cfg,
    env: params.env,
  });

  let matrixSnapshotReady = true;
  if (migrationStatus.actionable) {
    try {
      const snapshot = await maybeCreateMatrixMigrationSnapshot({
        trigger: "doctor-fix",
        env: params.env,
      });
      changes.push(
        `Matrix migration snapshot ${snapshot.created ? "created" : "reused"} before applying Matrix upgrades.\n- ${snapshot.archivePath}`,
      );
    } catch (error) {
      matrixSnapshotReady = false;
      warnings.push(
        `- Failed creating a Matrix migration snapshot before repair: ${String(error)}`,
      );
      warnings.push(
        '- Skipping Matrix migration changes for now. Resolve the snapshot failure, then rerun "openclaw doctor --fix".',
      );
    }
  } else if (migrationStatus.pending) {
    warnings.push(
      "- Matrix migration warnings are present, but no on-disk Matrix mutation is actionable yet. No pre-migration snapshot was needed.",
    );
  }

  if (!matrixSnapshotReady) {
    return { changes, warnings };
  }
  return { changes, warnings };
}

export async function runMatrixDoctorSequence(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  shouldRepair: boolean;
}): Promise<{ changeNotes: string[]; warningNotes: string[] }> {
  const warningNotes: string[] = [];
  const changeNotes: string[] = [];
  const installWarnings = await collectMatrixInstallPathWarnings(params.cfg);
  if (installWarnings.length > 0) {
    warningNotes.push(installWarnings.join("\n"));
  }
  if (!configMayNeedMatrixDoctorSequence(params.cfg, params.env)) {
    return { changeNotes, warningNotes };
  }

  if (params.shouldRepair) {
    const repair = await applyMatrixDoctorRepair({
      cfg: params.cfg,
      env: params.env,
    });
    changeNotes.push(...repair.changes);
    warningNotes.push(...repair.warnings);
  } else {
    const migrationStatus = resolveMatrixMigrationStatus({
      cfg: params.cfg,
      env: params.env,
    });
  }

  return { changeNotes, warningNotes };
}

export const matrixDoctor: ChannelDoctorAdapter = {
  dmAllowFromMode: "nestedOnly",
  groupModel: "sender",
  groupAllowFromFallbackToAllowFrom: false,
  warnOnEmptyGroupSenderAllowlist: true,
  normalizeCompatibilityConfig: normalizeMatrixCompatibilityConfig,
  runConfigSequence: async ({ cfg, env, shouldRepair }) =>
    await runMatrixDoctorSequence({ cfg, env, shouldRepair }),
  cleanStaleConfig: async ({ cfg }) => await cleanStaleMatrixPluginConfig(cfg),
};
