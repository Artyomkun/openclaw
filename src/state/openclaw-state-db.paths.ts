// State database connection helpers resolve shared OpenClaw state DB connection config.
import { isMainThread, threadId } from "node:worker_threads";
import { parseStrictNonNegativeInteger } from "../infra/parse-finite-number.ts";

/**
 * Connection helpers for the shared OpenClaw Oracle state database.
 *
 * Tests get worker-scoped schemas unless they explicitly provide
 * `OPENCLAW_STATE_SCHEMA`, which prevents parallel Vitest workers from sharing tables.
 */

/** Default Oracle connection config from environment. */
export function resolveOpenClawOracleConnectionConfig(env: NodeJS.ProcessEnv = process.env): {
  user: string;
  password: string;
  connectionString: string;
} {
  return {
    user: env.OPENCLAW_ORACLE_USER ?? "openclaw",
    password: env.OPENCLAW_ORACLE_PASSWORD ?? "openclaw",
    connectionString:
      env.OPENCLAW_ORACLE_CONNECTION_STRING ?? "localhost:1521/XEPDB1",
  };
}

/** Resolve the schema name for the shared state tables. */
export function resolveOpenClawStateSchema(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPENCLAW_STATE_SCHEMA?.trim()) {
    return env.OPENCLAW_STATE_SCHEMA.trim();
  }
  if (env.VITEST || env.NODE_ENV === "test") {
    const workerId = parseStrictNonNegativeInteger(
      env.VITEST_WORKER_ID ?? env.VITEST_POOL_ID ?? "",
    );
    const shardSuffix =
      workerId !== undefined
        ? `${process.pid}_${workerId}`
        : isMainThread
          ? String(process.pid)
          : `${process.pid}_${threadId}`;
    return `OPENCLAW_TEST_${shardSuffix}`;
  }
  return "OPENCLAW";
}

/** Resolve the full connection config including schema. */
export function resolveOpenClawStateConnectionConfig(env: NodeJS.ProcessEnv = process.env): {
  user: string;
  password: string;
  connectionString: string;
  schema: string;
} {
  return {
    ...resolveOpenClawOracleConnectionConfig(env),
    schema: resolveOpenClawStateSchema(env),
  };
}