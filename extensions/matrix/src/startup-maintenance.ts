// Matrix plugin module implements startup maintenance behavior.
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  maybeCreateMatrixMigrationSnapshot,
  resolveMatrixMigrationStatus
} from "./matrix-migration.runtime.js";

type MatrixStartupLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export async function runMatrixStartupMaintenance(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  log: MatrixStartupLogger;
  trigger?: string;
  logPrefix?: string;
  deps?: {
    maybeCreateMatrixMigrationSnapshot?: typeof maybeCreateMatrixMigrationSnapshot;
  };
}): Promise<void> {
  const env = params.env ?? process.env;
  const createSnapshot =
    params.deps?.maybeCreateMatrixMigrationSnapshot ?? maybeCreateMatrixMigrationSnapshot;
  const trigger = params.trigger?.trim() || "gateway-startup";
  const logPrefix = params.logPrefix?.trim() || "gateway";
  const migrationStatus = resolveMatrixMigrationStatus({ cfg: params.cfg, env });

  if (!migrationStatus.pending) {
    return;
  }
  if (!migrationStatus.actionable) {
    params.log.info?.(
      "matrix: migration remains in a warning-only state; no pre-migration snapshot was needed yet",
    );
    return;
  }

  try {
    await createSnapshot({
      trigger,
      env,
      log: params.log,
    });
  } catch (err) {
    params.log.warn?.(
      `${logPrefix}: failed creating a Matrix migration snapshot; skipping Matrix migration for now: ${String(err)}`,
    );
    return;
  }
}
