/**
 * Oracle persistence adapter for auth profile secrets and runtime state.
 * The public helpers expose raw JSON payloads so normalization stays in the
 * store/state layers that own compatibility rules.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { requireNodeOracle } from "../../infra/node-oracle.ts";
import { resolveUserPath } from "../../utils.ts";
import { resolveRegisteredAgentIdForDir } from "../agent-dir-registry.ts";
import { resolveDefaultAgentDir } from "../agent-scope-config.ts";

type AuthProfileRow = {
  STORE_KEY: string;
  STORE_JSON: string;
  UPDATED_AT: number;
};

type AuthProfileStateRow = {
  STATE_KEY: string;
  STATE_JSON: string;
  UPDATED_AT: number;
};

const PRIMARY_ROW_KEY = "primary";
let pool: any = null;
let poolConfig: any = null;

function resolveAgentDir(agentDir?: string): string {
  return resolveUserPath(agentDir ?? resolveDefaultAgentDir({}));
}

function inferAgentIdFromDir(agentDir: string): string {
  const normalized = path.normalize(agentDir);
  if (path.basename(normalized) === "agent") {
    const parent = path.basename(path.dirname(normalized));
    if (parent) {
      return parent;
    }
  }
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `custom-${hash}`;
}

function getPool() {
  if (!pool) {
    const oracledb = requireNodeOracle();
    poolConfig = {
      user: process.env.ORACLE_USER || "openclaw",
      password: process.env.ORACLE_PASSWORD || "",
      connectString: process.env.ORACLE_CONNECTION_STRING || "localhost:1521/XEPDB1",
      poolMin: 1,
      poolMax: 10,
    };
    pool = oracledb.createPool(poolConfig);
  }
  return pool;
}

async function getConnection() {
  const pool = getPool();
  return await pool.getConnection();
}

async function ensureSchema(): Promise<void> {
  const conn = await getConnection();
  try {
    // Таблица для хранения профилей
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE auth_profile_store (
          store_key VARCHAR2(64) PRIMARY KEY,
          store_json CLOB NOT NULL,
          updated_at NUMBER NOT NULL
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    // Таблица для состояния
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE auth_profile_state (
          state_key VARCHAR2(64) PRIMARY KEY,
          state_json CLOB NOT NULL,
          updated_at NUMBER NOT NULL
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.commit();
  } finally {
    await conn.close();
  }
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readAuthProfileJson(target: "store" | "state"): Promise<unknown> {
  try {
    const conn = await getConnection();
    try {
      const table = target === "store" ? "auth_profile_store" : "auth_profile_state";
      const keyColumn = target === "store" ? "store_key" : "state_key";
      const jsonColumn = target === "store" ? "store_json" : "state_json";

      const result = await conn.execute(
        `SELECT ${jsonColumn} FROM ${table} WHERE ${keyColumn} = :key`,
        { key: PRIMARY_ROW_KEY }
      );

      if (result.rows.length === 0) return null;
      const row = result.rows[0] as { [key: string]: string };
      return parseJson(row[jsonColumn.toUpperCase()]);
    } finally {
      await conn.close();
    }
  } catch {
    return null;
  }
}

async function writeAuthProfileJson(
  target: "store" | "state",
  payload: unknown
): Promise<void> {
  const conn = await getConnection();
  try {
    const table = target === "store" ? "auth_profile_store" : "auth_profile_state";
    const keyColumn = target === "store" ? "store_key" : "state_key";
    const jsonColumn = target === "store" ? "store_json" : "state_json";

    await conn.execute(
      `MERGE INTO ${table} t
       USING (SELECT :key AS key FROM DUAL) s
       ON (t.${keyColumn} = s.key)
       WHEN MATCHED THEN UPDATE SET
         ${jsonColumn} = :json,
         updated_at = :updated_at
       WHEN NOT MATCHED THEN INSERT
         (${keyColumn}, ${jsonColumn}, updated_at)
       VALUES
         (:key, :json, :updated_at)`,
      {
        key: PRIMARY_ROW_KEY,
        json: JSON.stringify(payload),
        updated_at: Date.now(),
      }
    );

    await conn.commit();
  } finally {
    await conn.close();
  }
}

async function deleteAuthProfile(target: "store" | "state"): Promise<void> {
  const conn = await getConnection();
  try {
    const table = target === "store" ? "auth_profile_store" : "auth_profile_state";
    const keyColumn = target === "store" ? "store_key" : "state_key";

    await conn.execute(
      `DELETE FROM ${table} WHERE ${keyColumn} = :key`,
      { key: PRIMARY_ROW_KEY }
    );

    await conn.commit();
  } finally {
    await conn.close();
  }
}

// ============================================================
// Public API
// ============================================================

/** Resolves the database identifier for auth profiles. */
export function resolveAuthProfileDatabasePath(agentDir?: string): string {
  const dir = resolveAgentDir(agentDir);
  return path.join(dir, "openclaw-agent.oracle");
}

/** Resolves all database files used by auth profiles (Oracle has single file). */
export function resolveAuthProfileDatabaseFilePaths(agentDir?: string): string[] {
  return [resolveAuthProfileDatabasePath(agentDir)];
}

/** Reads the raw persisted secrets-store payload. */
export async function readPersistedAuthProfileStoreRaw(
  agentDir?: string,
): Promise<unknown> {
  await ensureSchema();
  return await readAuthProfileJson("store");
}

/** Reads the raw persisted runtime-state payload. */
export async function readPersistedAuthProfileStateRaw(
  agentDir?: string,
): Promise<unknown> {
  await ensureSchema();
  return await readAuthProfileJson("state");
}

/** Writes the raw persisted secrets-store payload. */
export async function writePersistedAuthProfileStoreRaw(
  payload: unknown,
  agentDir?: string,
): Promise<void> {
  await ensureSchema();
  await writeAuthProfileJson("store", payload);
}

/** Deletes the persisted secrets-store row. */
export async function deletePersistedAuthProfileStoreRaw(
  agentDir?: string,
): Promise<void> {
  await ensureSchema();
  await deleteAuthProfile("store");
}

/** Writes or deletes the persisted runtime-state payload. */
export async function writePersistedAuthProfileStateRaw(
  payload: unknown,
  agentDir?: string,
): Promise<void> {
  await ensureSchema();
  if (!payload) {
    await deleteAuthProfile("state");
  } else {
    await writeAuthProfileJson("state", payload);
  }
}

/** Runs an auth-profile database write transaction. */
export async function runAuthProfileWriteTransaction<T>(
  agentDir: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  await ensureSchema();
  return await operation();
}