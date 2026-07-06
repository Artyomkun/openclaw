// OpenClaw state database manages shared persisted state and migrations — Oracle Edition.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import oracledb from "oracledb";
import { createSubsystemLogger } from "../logging/subsystem.ts";
import type { DB as OpenClawStateKyselyDatabase } from "./openclaw-state-db.generated.ts";
import { OPENCLAW_STATE_SCHEMA_SQL } from "./openclaw-state-schema.generated.ts";

// ─── Constants ─────────────────────────────────────────────

const OPENCLAW_STATE_SCHEMA_VERSION = 1;
const OPENCLAW_STATE_DIR_MODE = 0o700;
const ORACLE_POOL_MAX = 4;
const ORACLE_POOL_MIN = 1;

// ─── Types ─────────────────────────────────────────────────

export type OpenClawStateDatabase = {
  db: oracledb.Connection;
  path: string;
};

export type OpenClawStateDatabaseOptions = {
  env?: NodeJS.ProcessEnv;
  path?: string;
};

export type OpenClawStateDatabaseSchemaMigration = {
  kind: "agent-databases-composite-primary-key";
  path: string;
};

// ─── State ─────────────────────────────────────────────────

const stateDbLog = createSubsystemLogger("state/db");
const chmodWarnedTargets = new Set<string>();
let oraclePool: oracledb.Pool | null = null;

// ─── Oracle Connection Pool ────────────────────────────────

async function getOraclePool(): Promise<oracledb.Pool> {
  if (oraclePool) return oraclePool;
  oraclePool = await oracledb.createPool({
    user: process.env.OPENCLAW_ORACLE_USER ?? "openclaw",
    password: process.env.OPENCLAW_ORACLE_PASSWORD ?? "openclaw",
    connectionString: process.env.OPENCLAW_ORACLE_CONNECTION_STRING ?? "localhost:1521/XEPDB1",
    poolMin: ORACLE_POOL_MIN,
    poolMax: ORACLE_POOL_MAX,
    poolIncrement: 1,
    poolTimeout: 60,
  });
  return oraclePool;
}

async function getOracleConnection(): Promise<oracledb.Connection> {
  const pool = await getOraclePool();
  return pool.getConnection();
}

export async function closeOpenClawStateDatabase(): Promise<void> {
  if (oraclePool) {
    await oraclePool.close(0);
    oraclePool = null;
  }
}

export async function isOpenClawStateDatabaseOpen(): Promise<boolean> {
  return oraclePool !== null && (await oraclePool.getConnection()).isAlive;
}

export const closeOpenClawStateDatabaseForTest = closeOpenClawStateDatabase;

// ─── Permission Hardening ──────────────────────────────────

function bestEffortChmodSync(target: string, mode: number): void {
  try {
    const { chmodSync } = require("node:fs");
    chmodSync(target, mode);
  } catch (err) {
    if (!chmodWarnedTargets.has(target)) {
      chmodWarnedTargets.add(target);
      stateDbLog.warn(`skipped permission hardening for ${target}: ${String(err)}`);
    }
  }
}

// ─── Path Resolution ───────────────────────────────────────

function resolveOpenClawStateSqliteDir(env: NodeJS.ProcessEnv): string {
  return env.OPENCLAW_STATE_DIR || path.join(env.HOME || "/tmp", ".openclaw", "state");
}

function resolveOpenClawStateSqlitePath(env: NodeJS.ProcessEnv): string {
  return path.join(resolveOpenClawStateSqliteDir(env), "openclaw-state.sqlite");
}

function resolveDatabasePath(options: OpenClawStateDatabaseOptions = {}): string {
  return path.resolve(options.path ?? resolveOpenClawStateSqlitePath(options.env ?? process.env));
}

// ─── Schema Management ─────────────────────────────────────

async function tableExists(conn: oracledb.Connection, tableName: string): Promise<boolean> {
  const result = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM all_tables WHERE table_name = :name AND owner = USER`,
    { name: tableName.toUpperCase() },
  );
  const rows = result.rows as Array<[number]> | undefined;
  return (rows?.[0]?.[0] ?? 0) > 0;
}

async function tableHasColumn(conn: oracledb.Connection, tableName: string, columnName: string): Promise<boolean> {
  const result = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM all_tab_columns WHERE table_name = :tname AND column_name = :cname AND owner = USER`,
    { tname: tableName.toUpperCase(), cname: columnName.toUpperCase() },
  );
  const rows = result.rows as Array<[number]> | undefined;
  return (rows?.[0]?.[0] ?? 0) > 0;
}

async function ensureColumn(conn: oracledb.Connection, tableName: string, columnName: string, columnType: string, defaultValue: string): Promise<boolean> {
  if (!(await tableExists(conn, tableName)) || (await tableHasColumn(conn, tableName, columnName))) {
    return false;
  }
  await conn.execute(`ALTER TABLE ${tableName} ADD (${columnName} ${columnType} DEFAULT ${defaultValue})`);
  return true;
}

async function ensureSchema(conn: oracledb.Connection): Promise<void> {
  const schemaSql = OPENCLAW_STATE_SCHEMA_SQL;
  const statements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await conn.execute(stmt);
    } catch (err) {
      if ((err as Error & { errorNum?: number }).errorNum === 955) {
        // ORA-00955: table already exists — skip
        continue;
      }
      throw err;
    }
  }

  // Ensure additive columns
  await ensureColumn(conn, "cron_run_logs", "entry_json", "CLOB", "EMPTY_CLOB()");
  await ensureColumn(conn, "cron_jobs", "name", "VARCHAR2(255)", "''");
  await ensureColumn(conn, "sandbox_registry_entries", "session_key", "VARCHAR2(255)", "NULL");
  await ensureColumn(conn, "sandbox_registry_entries", "backend_id", "VARCHAR2(255)", "NULL");
  await ensureColumn(conn, "delivery_queue_entries", "entry_kind", "VARCHAR2(100)", "NULL");
  await ensureColumn(conn, "commitments", "kind", "VARCHAR2(100)", "'followup'");

  // Upsert schema meta
  const now = Date.now();
  await conn.execute(
    `MERGE INTO schema_meta dst
     USING (SELECT 'primary' AS meta_key FROM DUAL) src
        ON (dst.meta_key = src.meta_key)
      WHEN MATCHED THEN UPDATE SET
        role = 'global',
        schema_version = :version,
        agent_id = NULL,
        app_version = NULL,
        updated_at = :now
      WHEN NOT MATCHED THEN INSERT (
        meta_key, role, schema_version, agent_id, app_version, created_at, updated_at
      ) VALUES (
        'primary', 'global', :version, NULL, NULL, :now, :now
      )`,
    { version: OPENCLAW_STATE_SCHEMA_VERSION, now },
  );
}

// ─── Database Open ─────────────────────────────────────────

export async function openOpenClawStateDatabase(
  options: OpenClawStateDatabaseOptions = {},
): Promise<OpenClawStateDatabase> {
  const pathname = resolveDatabasePath(options);

  // Ensure directory exists for compatibility logs
  const dir = path.dirname(pathname);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: OPENCLAW_STATE_DIR_MODE });
    bestEffortChmodSync(dir, OPENCLAW_STATE_DIR_MODE);
  }

  const conn = await getOracleConnection();
  try {
    await ensureSchema(conn);
    await conn.commit();
  } catch (err) {
    await conn.close();
    throw err;
  }

  return { db: conn, path: pathname };
}

// ─── Write Transactions ────────────────────────────────────

export async function runOpenClawStateWriteTransaction<T>(
  operation: (database: OpenClawStateDatabase) => Promise<T>,
  options: OpenClawStateDatabaseOptions = {},
): Promise<T> {
  const database = await openOpenClawStateDatabase(options);
  try {
    const result = await operation(database);
    await database.db.commit();
    return result;
  } catch (err) {
    await database.db.rollback();
    throw err;
  } finally {
    await database.db.close();
  }
}

// ─── Schema Migration Detection ────────────────────────────

export async function detectOpenClawStateDatabaseSchemaMigrations(
  options: OpenClawStateDatabaseOptions = {},
): Promise<OpenClawStateDatabaseSchemaMigration[]> {
  const pathname = resolveDatabasePath(options);
  if (!existsSync(pathname)) {
    return [];
  }

  const database = await openOpenClawStateDatabase(options);
  try {
    const hasCanonical = await tableHasColumn(database.db, "agent_databases", "path");
    return hasCanonical
      ? []
      : [{ kind: "agent-databases-composite-primary-key", path: pathname }];
  } finally {
    await database.db.close();
  }
}

// ─── Schema Repair ─────────────────────────────────────────

export async function repairOpenClawStateDatabaseSchema(
  options: OpenClawStateDatabaseOptions = {},
): Promise<{ changes: string[]; warnings: string[] }> {
  const pathname = resolveDatabasePath(options);
  if (!existsSync(pathname)) {
    return { changes: [], warnings: [] };
  }

  const database = await openOpenClawStateDatabase(options);
  try {
    // Check if agent_databases needs composite primary key migration
    const needsMigration = !(await tableHasColumn(database.db, "agent_databases", "path"));
    if (needsMigration) {
      return {
        changes: [],
        warnings: [`Agent database registry migration required for ${pathname}. Run doctor.`],
      };
    }
    return { changes: [], warnings: [] };
  } catch (err) {
    return {
      changes: [],
      warnings: [`Failed migrating shared state database schema at ${pathname}: ${String(err)}`],
    };
  } finally {
    await database.db.close();
  }
}