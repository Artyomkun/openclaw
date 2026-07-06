// Plugin state Oracle helpers persist plugin state in Oracle Database — TLS 1.3 / HTTP/3 ready
import { resolveExpiresAtMsFromDurationMs } from "@openclaw/normalization-core/number-coercion";
import { requireNodeOracle } from "../infra/node-oracle.ts";

export const MAX_PLUGIN_STATE_VALUE_BYTES = 65_536;
export const MAX_PLUGIN_STATE_ENTRIES_PER_PLUGIN = 50_000;

export type PluginStateEntry<T = unknown> = {
  key: string;
  value: T;
  createdAt: number;
  expiresAt?: number;
};

export type PluginStateStoreErrorCode =
  | "PLUGIN_STATE_OPEN_FAILED"
  | "PLUGIN_STATE_READ_FAILED"
  | "PLUGIN_STATE_WRITE_FAILED"
  | "PLUGIN_STATE_INVALID_INPUT"
  | "PLUGIN_STATE_LIMIT_EXCEEDED"
  | "PLUGIN_STATE_CORRUPT"
  | "PLUGIN_STATE_SQLITE_UNAVAILABLE";

export type PluginStateStoreOperation =
  | "open"
  | "register"
  | "lookup"
  | "consume"
  | "delete"
  | "entries"
  | "clear"
  | "sweep"
  | "probe";

export class PluginStateStoreError extends Error {
  readonly code: PluginStateStoreErrorCode;
  readonly operation: PluginStateStoreOperation;
  readonly path?: string;

  constructor(
    message: string,
    params: {
      code: PluginStateStoreErrorCode;
      operation: PluginStateStoreOperation;
      path?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: params.cause });
    this.name = "PluginStateStoreError";
    this.code = params.code;
    this.operation = params.operation;
    this.path = params.path;
  }
}

export type PluginStateStoreProbeStep = {
  name: string;
  ok: boolean;
  code?: string;
  message?: string;
};

export type PluginStateStoreProbeResult = {
  ok: boolean;
  databasePath: string;
  steps: PluginStateStoreProbeStep[];
};

type PluginStateRow = {
  PLUGIN_ID: string;
  NAMESPACE: string;
  ENTRY_KEY: string;
  VALUE_JSON: string;
  CREATED_AT: number;
  EXPIRES_AT: number | null;
};

type CountRow = {
  COUNT: number;
};

let pool: any = null;
let poolConfig: any = null;

function getPoolConfig() {
  return {
    user: process.env.ORACLE_USER || "openclaw",
    password: process.env.ORACLE_PASSWORD || "",
    connectString: process.env.ORACLE_CONNECTION_STRING || "localhost:1521/XEPDB1",
    poolMin: 1,
    poolMax: 10,
  };
}

async function getConnection() {
  if (!pool) {
    const oracledb = requireNodeOracle();
    poolConfig = getPoolConfig();
    pool = await oracledb.createPool(poolConfig);
    await initSchema();
  }
  return await pool.getConnection();
}

async function initSchema(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE plugin_state_entries (
          plugin_id VARCHAR2(128) NOT NULL,
          namespace VARCHAR2(256) NOT NULL,
          entry_key VARCHAR2(512) NOT NULL,
          value_json CLOB NOT NULL,
          created_at NUMBER NOT NULL,
          expires_at NUMBER,
          PRIMARY KEY (plugin_id, namespace, entry_key)
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_plugin_state_expires ON plugin_state_entries(expires_at)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_plugin_state_plugin_namespace ON plugin_state_entries(plugin_id, namespace)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.commit();
  } finally {
    await conn.close();
  }
}

function createError(
  code: PluginStateStoreErrorCode,
  operation: PluginStateStoreOperation,
  message: string,
  path?: string,
  cause?: unknown,
): PluginStateStoreError {
  return new PluginStateStoreError(message, { code, operation, path, cause });
}

function resolveExpiresAt(ttlMs: number | undefined, now: number): number | null {
  if (ttlMs == null) return null;
  const expiresAt = resolveExpiresAtMsFromDurationMs(ttlMs, { nowMs: now });
  if (expiresAt === undefined) {
    throw createError("PLUGIN_STATE_INVALID_INPUT", "register", "Invalid TTL");
  }
  return expiresAt;
}

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw createError("PLUGIN_STATE_CORRUPT", "lookup", "Corrupt JSON", undefined, error);
  }
}

function rowToEntry(row: PluginStateRow): PluginStateEntry<unknown> {
  return {
    key: row.ENTRY_KEY,
    value: parseValue(row.VALUE_JSON),
    createdAt: row.CREATED_AT,
    ...(row.EXPIRES_AT != null ? { expiresAt: row.EXPIRES_AT } : {}),
  };
}

export async function pluginStateRegister(params: {
  pluginId: string;
  namespace: string;
  key: string;
  valueJson: string;
  maxEntries: number;
  ttlMs?: number;
}): Promise<void> {
  const conn = await getConnection();
  try {
    const now = Date.now();
    const expiresAt = resolveExpiresAt(params.ttlMs, now);

    await conn.execute(
      `MERGE INTO plugin_state_entries t
       USING (SELECT :plugin_id AS plugin_id, :namespace AS namespace, :entry_key AS entry_key FROM DUAL) s
       ON (t.plugin_id = s.plugin_id AND t.namespace = s.namespace AND t.entry_key = s.entry_key)
       WHEN MATCHED THEN UPDATE SET
         value_json = :value_json,
         created_at = :created_at,
         expires_at = :expires_at
       WHEN NOT MATCHED THEN INSERT
         (plugin_id, namespace, entry_key, value_json, created_at, expires_at)
       VALUES
         (:plugin_id, :namespace, :entry_key, :value_json, :created_at, :expires_at)`,
      {
        plugin_id: params.pluginId,
        namespace: params.namespace,
        entry_key: params.key,
        value_json: params.valueJson,
        created_at: now,
        expires_at: expiresAt,
      }
    );

    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function pluginStateLookup(params: {
  pluginId: string;
  namespace: string;
  key: string;
}): Promise<unknown> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT plugin_id, namespace, entry_key, value_json, created_at, expires_at
       FROM plugin_state_entries
       WHERE plugin_id = :plugin_id
         AND namespace = :namespace
         AND entry_key = :entry_key
         AND (expires_at IS NULL OR expires_at > :now)`,
      {
        plugin_id: params.pluginId,
        namespace: params.namespace,
        entry_key: params.key,
        now: Date.now(),
      }
    );

    if (result.rows.length === 0) return undefined;
    const row = result.rows[0] as PluginStateRow;
    return parseValue(row.VALUE_JSON);
  } finally {
    await conn.close();
  }
}

export async function pluginStateDelete(params: {
  pluginId: string;
  namespace: string;
  key: string;
}): Promise<boolean> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `DELETE FROM plugin_state_entries
       WHERE plugin_id = :plugin_id
         AND namespace = :namespace
         AND entry_key = :entry_key`,
      {
        plugin_id: params.pluginId,
        namespace: params.namespace,
        entry_key: params.key,
      }
    );
    await conn.commit();
    return result.rowsAffected > 0;
  } finally {
    await conn.close();
  }
}

export async function pluginStateEntries(params: {
  pluginId: string;
  namespace: string;
}): Promise<PluginStateEntry<unknown>[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT plugin_id, namespace, entry_key, value_json, created_at, expires_at
       FROM plugin_state_entries
       WHERE plugin_id = :plugin_id
         AND namespace = :namespace
         AND (expires_at IS NULL OR expires_at > :now)
       ORDER BY created_at ASC, entry_key ASC`,
      {
        plugin_id: params.pluginId,
        namespace: params.namespace,
        now: Date.now(),
      }
    );

    return (result.rows as PluginStateRow[]).map(rowToEntry);
  } finally {
    await conn.close();
  }
}

export async function pluginStateClear(params: {
  pluginId: string;
  namespace: string;
}): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `DELETE FROM plugin_state_entries
       WHERE plugin_id = :plugin_id AND namespace = :namespace`,
      {
        plugin_id: params.pluginId,
        namespace: params.namespace,
      }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function sweepExpiredPluginStateEntries(): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `DELETE FROM plugin_state_entries WHERE expires_at IS NOT NULL AND expires_at <= :now`,
      { now: Date.now() }
    );
    await conn.commit();
    return result.rowsAffected;
  } finally {
    await conn.close();
  }
}

export async function closePluginStateDatabase(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export async function probePluginStateStore(): Promise<PluginStateStoreProbeResult> {
  const steps: PluginStateStoreProbeStep[] = [];
  const databasePath = process.env.ORACLE_CONNECTION_STRING || "localhost:1521/XEPDB1";

  try {
    requireNodeOracle();
    steps.push({ name: "load-oracle", ok: true });
  } catch (error) {
    steps.push({
      name: "load-oracle",
      ok: false,
      code: "PLUGIN_STATE_SQLITE_UNAVAILABLE",
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, databasePath, steps };
  }

  try {
    const conn = await getConnection();
    steps.push({ name: "connect", ok: true });

    await conn.execute(`SELECT 1 FROM plugin_state_entries WHERE ROWNUM = 1`);
    steps.push({ name: "schema", ok: true });

    const now = Date.now();
    await conn.execute(
      `INSERT INTO plugin_state_entries
       (plugin_id, namespace, entry_key, value_json, created_at, expires_at)
       VALUES ('core:probe', 'diagnostics', 'probe', '{"ok":true}', :now, :expires_at)`,
      { now, expires_at: now + 60000 }
    );
    steps.push({ name: "write", ok: true });

    const result = await conn.execute(
      `SELECT value_json FROM plugin_state_entries
       WHERE plugin_id = 'core:probe' AND namespace = 'diagnostics' AND entry_key = 'probe'`
    );
    steps.push({ name: "read", ok: true });

    await conn.execute(
      `DELETE FROM plugin_state_entries WHERE plugin_id = 'core:probe' AND namespace = 'diagnostics'`
    );
    steps.push({ name: "delete", ok: true });

    await conn.commit();
    await conn.close();
    steps.push({ name: "close", ok: true });
  } catch (error) {
    steps.push({
      name: "probe",
      ok: false,
      code: "PLUGIN_STATE_OPEN_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return { ok: steps.every((step) => step.ok), databasePath, steps };
}