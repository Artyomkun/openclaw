/** Oracle-backed cron run-log storage helpers. */
import { requireNodeOracle } from "../../infra/node-oracle.ts";
import { normalizeOracleNumber } from "../../infra/oracle-number.ts";
import type { CronRunLogEntry } from "../run-log-types.ts";
import type { CronDeliveryStatus, CronRunStatus } from "../types.ts";
import { parseCronRunLogEntryObject } from "./entry-codec.ts";

type CronRunLogRow = {
  STORE_KEY: string;
  JOB_ID: string;
  SEQ: number;
  TS: number;
  STATUS: string | null;
  ERROR: string | null;
  SUMMARY: string | null;
  DIAGNOSTICS_SUMMARY: string | null;
  DELIVERY_STATUS: string | null;
  DELIVERY_ERROR: string | null;
  DELIVERED: number | null;
  SESSION_ID: string | null;
  SESSION_KEY: string | null;
  RUN_ID: string | null;
  RUN_AT_MS: number | null;
  DURATION_MS: number | null;
  NEXT_RUN_AT_MS: number | null;
  MODEL: string | null;
  PROVIDER: string | null;
  TOTAL_TOKENS: number | null;
  ENTRY_JSON: string;
  CREATED_AT: number;
};

let pool: any = null;

function getPool() {
  if (!pool) {
    const oracledb = requireNodeOracle();
    pool = oracledb.createPool({
      user: process.env.ORACLE_USER || "openclaw",
      password: process.env.ORACLE_PASSWORD || "",
      connectString: process.env.ORACLE_CONNECTION_STRING || "localhost:1521/XEPDB1",
      poolMin: 1,
      poolMax: 10,
    });
  }
  return pool;
}

async function getConnection() {
  return await getPool().getConnection();
}

async function ensureSchema(): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE cron_run_logs (
          store_key VARCHAR2(512) NOT NULL,
          job_id VARCHAR2(128) NOT NULL,
          seq NUMBER NOT NULL,
          ts NUMBER NOT NULL,
          status VARCHAR2(32),
          error CLOB,
          summary CLOB,
          diagnostics_summary CLOB,
          delivery_status VARCHAR2(32),
          delivery_error CLOB,
          delivered NUMBER,
          session_id VARCHAR2(128),
          session_key VARCHAR2(128),
          run_id VARCHAR2(128),
          run_at_ms NUMBER,
          duration_ms NUMBER,
          next_run_at_ms NUMBER,
          model VARCHAR2(128),
          provider VARCHAR2(128),
          total_tokens NUMBER,
          entry_json CLOB NOT NULL,
          created_at NUMBER NOT NULL,
          PRIMARY KEY (store_key, job_id, seq)
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_cron_run_logs_ts ON cron_run_logs(store_key, ts DESC)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_cron_run_logs_job_ts ON cron_run_logs(job_id, ts DESC)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_cron_run_logs_status ON cron_run_logs(store_key, status)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.commit();
  } finally {
    await conn.close();
  }
}

function booleanToInteger(value: boolean | undefined): number | null {
  return typeof value === "boolean" ? (value ? 1 : 0) : null;
}

function integerToBoolean(value: number | null): boolean | undefined {
  const normalized = normalizeOracleNumber(value);
  return normalized == null ? undefined : normalized !== 0;
}

function bindCronRunLogRow(params: {
  storeKey: string;
  seq: number;
  entry: CronRunLogEntry;
}): CronRunLogRow {
  const entry = params.entry;
  return {
    STORE_KEY: params.storeKey,
    JOB_ID: entry.jobId,
    SEQ: params.seq,
    TS: entry.ts,
    STATUS: entry.status ?? null,
    ERROR: entry.error ?? null,
    SUMMARY: entry.summary ?? null,
    DIAGNOSTICS_SUMMARY: entry.diagnostics?.summary ?? null,
    DELIVERY_STATUS: entry.deliveryStatus ?? null,
    DELIVERY_ERROR: entry.deliveryError ?? null,
    DELIVERED: booleanToInteger(entry.delivered),
    SESSION_ID: entry.sessionId ?? null,
    SESSION_KEY: entry.sessionKey ?? null,
    RUN_ID: entry.runId ?? null,
    RUN_AT_MS: entry.runAtMs ?? null,
    DURATION_MS: entry.durationMs ?? null,
    NEXT_RUN_AT_MS: entry.nextRunAtMs ?? null,
    MODEL: entry.model ?? null,
    PROVIDER: entry.provider ?? null,
    TOTAL_TOKENS: entry.usage?.total_tokens ?? null,
    ENTRY_JSON: JSON.stringify(entry),
    CREATED_AT: Date.now(),
  };
}

function parseStoredRunLogRow(row: CronRunLogRow): CronRunLogEntry | null {
  let rawEntry: unknown;
  try {
    rawEntry = JSON.parse(row.ENTRY_JSON);
  } catch {
    return null;
  }
  const parsed = parseCronRunLogEntryObject(rawEntry, { jobId: row.JOB_ID });
  if (!parsed) {
    return null;
  }
  return {
    ...parsed,
    ts: normalizeOracleNumber(row.TS) ?? parsed.ts,
    jobId: row.JOB_ID,
    status: (row.STATUS as CronRunStatus | null) ?? parsed.status,
    error: row.ERROR ?? parsed.error,
    summary: row.SUMMARY ?? parsed.summary,
    delivered: integerToBoolean(row.DELIVERED) ?? parsed.delivered,
    deliveryStatus: (row.DELIVERY_STATUS as CronDeliveryStatus | null) ?? parsed.deliveryStatus,
    deliveryError: row.DELIVERY_ERROR ?? parsed.deliveryError,
    sessionId: row.SESSION_ID ?? parsed.sessionId,
    sessionKey: row.SESSION_KEY ?? parsed.sessionKey,
    runId: row.RUN_ID ?? parsed.runId,
    runAtMs: normalizeOracleNumber(row.RUN_AT_MS) ?? parsed.runAtMs,
    durationMs: normalizeOracleNumber(row.DURATION_MS) ?? parsed.durationMs,
    nextRunAtMs: normalizeOracleNumber(row.NEXT_RUN_AT_MS) ?? parsed.nextRunAtMs,
    model: row.MODEL ?? parsed.model,
    provider: row.PROVIDER ?? parsed.provider,
  };
}

async function readCronRunLogRows(
  storeKey: string,
  jobId?: string,
): Promise<CronRunLogRow[]> {
  const conn = await getConnection();
  try {
    let sql = `SELECT * FROM cron_run_logs WHERE store_key = :store_key`;
    const params: Record<string, unknown> = { store_key: storeKey };
    if (jobId) {
      sql += ` AND job_id = :job_id`;
      params.job_id = jobId;
    }
    sql += ` ORDER BY ts ASC, seq ASC`;
    const result = await conn.execute(sql, params);
    return result.rows as CronRunLogRow[];
  } finally {
    await conn.close();
  }
}

async function countCronRunLogRows(params: {
  storeKey: string;
  jobId?: string;
  statuses: CronRunStatus[] | null;
  deliveryStatuses: CronDeliveryStatus[] | null;
  runId?: string;
}): Promise<number> {
  const conn = await getConnection();
  try {
    let sql = `SELECT COUNT(*) AS count FROM cron_run_logs WHERE store_key = :store_key`;
    const queryParams: Record<string, unknown> = { store_key: params.storeKey };

    if (params.jobId) {
      sql += ` AND job_id = :job_id`;
      queryParams.job_id = params.jobId;
    }
    if (params.statuses?.length) {
      sql += ` AND status IN (${params.statuses.map(() => '?').join(',')})`;
      // Oracle позиционные параметры
    }
    if (params.deliveryStatuses?.length) {
      sql += ` AND (delivery_status IS NULL OR delivery_status IN (...))`;
    }
    if (params.runId) {
      sql += ` AND run_id = :run_id`;
      queryParams.run_id = params.runId;
    }

    const result = await conn.execute(sql, queryParams);
    return Number((result.rows[0] as { COUNT: number }).COUNT || 0);
  } finally {
    await conn.close();
  }
}

async function readCronRunLogRowsPage(params: {
  storeKey: string;
  jobId?: string;
  statuses: CronRunStatus[] | null;
  deliveryStatuses: CronDeliveryStatus[] | null;
  runId?: string;
  sortDir: "asc" | "desc";
  offset?: number;
  limit?: number;
}): Promise<CronRunLogRow[]> {
  const conn = await getConnection();
  try {
    let sql = `SELECT * FROM cron_run_logs WHERE store_key = :store_key`;
    const queryParams: Record<string, unknown> = { store_key: params.storeKey };

    if (params.jobId) {
      sql += ` AND job_id = :job_id`;
      queryParams.job_id = params.jobId;
    }
    if (params.statuses?.length) {
      sql += ` AND status IN (${params.statuses.map(() => '?').join(',')})`;
    }
    if (params.deliveryStatuses?.length) {
      sql += ` AND (delivery_status IS NULL OR delivery_status IN (...))`;
    }
    if (params.runId) {
      sql += ` AND run_id = :run_id`;
      queryParams.run_id = params.runId;
    }

    sql += ` ORDER BY ts ${params.sortDir === 'asc' ? 'ASC' : 'DESC'}, seq ${params.sortDir === 'asc' ? 'ASC' : 'DESC'}`;

    if (params.limit !== undefined && params.offset !== undefined) {
      sql += ` OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
      queryParams.offset = params.offset;
      queryParams.limit = params.limit;
    }

    const result = await conn.execute(sql, queryParams);
    return result.rows as CronRunLogRow[];
  } finally {
    await conn.close();
  }
}

async function nextCronRunLogSeq(storeKey: string, jobId: string): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT MAX(seq) AS seq FROM cron_run_logs WHERE store_key = :store_key AND job_id = :job_id`,
      { store_key: storeKey, job_id: jobId }
    );
    const maxSeq = result.rows.length > 0 ? (result.rows[0] as { SEQ: number | null }).SEQ : null;
    return (normalizeOracleNumber(maxSeq) ?? 0) + 1;
  } finally {
    await conn.close();
  }
}

async function pruneCronRunLogRows(
  storeKey: string,
  jobId: string,
  keepLines: number,
): Promise<void> {
  const keep = Math.max(1, Math.floor(keepLines));
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT seq FROM cron_run_logs
       WHERE store_key = :store_key AND job_id = :job_id
       ORDER BY seq DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { store_key: storeKey, job_id: jobId, offset: 0, limit: keep }
    );
    const keepSeqs = (result.rows as { SEQ: number }[]).map(row => row.SEQ);

    if (keepSeqs.length > 0) {
      const placeholders = keepSeqs.map(() => '?').join(',');
      await conn.execute(
        `DELETE FROM cron_run_logs
         WHERE store_key = :store_key AND job_id = :job_id AND seq NOT IN (${placeholders})`,
        { store_key: storeKey, job_id: jobId }
      );
    } else {
      await conn.execute(
        `DELETE FROM cron_run_logs WHERE store_key = :store_key AND job_id = :job_id`,
        { store_key: storeKey, job_id: jobId }
      );
    }
    await conn.commit();
  } finally {
    await conn.close();
  }
}

// ============================================================
// Public API
// ============================================================

/** Reads run-log rows for one store, optionally scoped to one job. */
export async function readCronRunLogEntries(
  storeKey: string,
  jobId?: string,
): Promise<CronRunLogEntry[]> {
  await ensureSchema();
  const rows = await readCronRunLogRows(storeKey, jobId);
  const entries: CronRunLogEntry[] = [];
  for (const row of rows) {
    const entry = parseStoredRunLogRow(row);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Counts run-log rows after applying filters. */
export async function countCronRunLogEntries(params: {
  storeKey: string;
  jobId?: string;
  statuses: CronRunStatus[] | null;
  deliveryStatuses: CronDeliveryStatus[] | null;
  runId?: string;
}): Promise<number> {
  await ensureSchema();
  return await countCronRunLogRows(params);
}

/** Reads a sorted, filtered page of cron run-log entries. */
export async function readCronRunLogEntriesPage(params: {
  storeKey: string;
  jobId?: string;
  statuses: CronRunStatus[] | null;
  deliveryStatuses: CronDeliveryStatus[] | null;
  runId?: string;
  sortDir: "asc" | "desc";
  offset?: number;
  limit?: number;
}): Promise<CronRunLogEntry[]> {
  await ensureSchema();
  const rows = await readCronRunLogRowsPage(params);
  const entries: CronRunLogEntry[] = [];
  for (const row of rows) {
    const entry = parseStoredRunLogRow(row);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Appends a cron run-log entry. */
export async function insertCronRunLogEntry(
  storeKey: string,
  entry: CronRunLogEntry,
): Promise<void> {
  await ensureSchema();
  await insertCronRunLogEntry(storeKey, entry);
}

/** Prunes old cron run-log entries for one job. */
export async function pruneCronRunLogEntries(
  storeKey: string,
  jobId: string,
  keepLines: number,
): Promise<void> {
  await ensureSchema();
  await pruneCronRunLogRows(storeKey, jobId, keepLines);
}