/** Oracle-backed ACP session metadata storage. */
import type { Connection } from "oracledb";
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { getRuntimeConfig } from "../../config/config.ts";
import { resolveStorePath } from "../../config/sessions/paths.ts";
import {
  listSessionEntries,
  type SessionEntrySummary,
} from "../../config/sessions/session-accessor.ts";
import {
  mergeSessionEntry,
  type AcpSessionRuntimeOptions,
  type SessionAcpIdentity,
  type SessionAcpMeta,
  type SessionEntry,
} from "../../config/sessions/types.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { parseAgentSessionKey } from "../../routing/session-key.ts";
import { isRecord } from "../../utils.ts";

// ===== Types =====
export type AcpSessionStoreEntry = {
  cfg: OpenClawConfig;
  storePath: string;
  sessionKey: string;
  storeSessionKey: string;
  entry?: SessionEntry;
  acp?: SessionAcpMeta;
  storeReadFailed?: boolean;
};

type AcpSessionRow = {
  session_key: string;
  session_id: string | null;
  backend: string;
  agent: string;
  runtime_session_name: string;
  identity_json: string | null;
  mode: "oneshot" | "persistent";
  runtime_options_json: string | null;
  cwd: string | null;
  state: "idle" | "running" | "error";
  last_activity_at: number;
  last_error: string | null;
  updated_at: number;
};

// ===== Helper Functions =====
function normalizeSessionKey(key: string): string {
  return normalizeLowercaseStringOrEmpty(key.trim());
}

function parseOptionalJsonRecord(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function rowToAcpSessionMeta(row: AcpSessionRow): SessionAcpMeta {
  return {
    backend: row.backend,
    agent: row.agent,
    runtimeSessionName: row.runtime_session_name,
    ...(row.identity_json ? { identity: parseOptionalJsonRecord(row.identity_json) as SessionAcpIdentity } : {}),
    mode: row.mode,
    ...(row.runtime_options_json ? { runtimeOptions: parseOptionalJsonRecord(row.runtime_options_json) as AcpSessionRuntimeOptions } : {}),
    ...(row.cwd ? { cwd: row.cwd } : {}),
    state: row.state,
    lastActivityAt: row.last_activity_at,
    ...(row.last_error ? { lastError: row.last_error } : {}),
  };
}

function metaToRow(params: {
  sessionKey: string;
  sessionId?: string;
  meta: SessionAcpMeta;
  updatedAt: number;
}): Omit<AcpSessionRow, "state"> & { state: string } {
  return {
    session_key: params.sessionKey,
    session_id: params.sessionId ?? null,
    backend: params.meta.backend,
    agent: params.meta.agent,
    runtime_session_name: params.meta.runtimeSessionName,
    identity_json: params.meta.identity ? JSON.stringify(params.meta.identity) : null,
    mode: params.meta.mode,
    runtime_options_json: params.meta.runtimeOptions ? JSON.stringify(params.meta.runtimeOptions) : null,
    cwd: params.meta.cwd ?? null,
    state: params.meta.state,
    last_activity_at: params.meta.lastActivityAt,
    last_error: params.meta.lastError ?? null,
    updated_at: params.updatedAt,
  };
}

// ===== Database Operations =====
async function executeQuery<T = any>(
  connection: Connection,
  sql: string,
  params?: any[]
): Promise<T[]> {
  const result = await connection.execute<T>(sql, params, { outFormat: 0 });
  return result.rows || [];
}

async function executeQueryOne<T = any>(
  connection: Connection,
  sql: string,
  params?: any[]
): Promise<T | undefined> {
  const rows = await executeQuery<T>(connection, sql, params);
  return rows[0];
}

async function selectAcpSessionRow(
  connection: Connection,
  sessionKey: string
): Promise<AcpSessionRow | undefined> {
  const sql = `
    SELECT * FROM acp_sessions 
    WHERE session_key = :sessionKey
  `;
  return executeQueryOne<AcpSessionRow>(connection, sql, [sessionKey]);
}

async function upsertAcpSessionRow(
  connection: Connection,
  row: Omit<AcpSessionRow, "state"> & { state: string }
): Promise<void> {
  const sql = `
    MERGE INTO acp_sessions t
    USING (SELECT :sessionKey AS session_key FROM DUAL) s
    ON (t.session_key = s.session_key)
    WHEN MATCHED THEN
      UPDATE SET
        session_id = :sessionId,
        backend = :backend,
        agent = :agent,
        runtime_session_name = :runtimeSessionName,
        identity_json = :identityJson,
        mode = :mode,
        runtime_options_json = :runtimeOptionsJson,
        cwd = :cwd,
        state = :state,
        last_activity_at = :lastActivityAt,
        last_error = :lastError,
        updated_at = :updatedAt
    WHEN NOT MATCHED THEN
      INSERT (
        session_key, session_id, backend, agent, runtime_session_name,
        identity_json, mode, runtime_options_json, cwd, state,
        last_activity_at, last_error, updated_at
      ) VALUES (
        :sessionKey, :sessionId, :backend, :agent, :runtimeSessionName,
        :identityJson, :mode, :runtimeOptionsJson, :cwd, :state,
        :lastActivityAt, :lastError, :updatedAt
      )
  `;
  await connection.execute(sql, {
    sessionKey: row.session_key,
    sessionId: row.session_id,
    backend: row.backend,
    agent: row.agent,
    runtimeSessionName: row.runtime_session_name,
    identityJson: row.identity_json,
    mode: row.mode,
    runtimeOptionsJson: row.runtime_options_json,
    cwd: row.cwd,
    state: row.state,
    lastActivityAt: row.last_activity_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  });
  await connection.commit();
}

async function deleteAcpSessionRow(
  connection: Connection,
  sessionKey: string
): Promise<void> {
  const sql = `DELETE FROM acp_sessions WHERE session_key = :sessionKey`;
  await connection.execute(sql, [sessionKey]);
  await connection.commit();
}

async function selectAllAcpSessions(
  connection: Connection
): Promise<AcpSessionRow[]> {
  const sql = `
    SELECT * FROM acp_sessions 
    ORDER BY last_activity_at DESC, session_key ASC
  `;
  return executeQuery<AcpSessionRow>(connection, sql);
}

// ===== Session Store Resolution =====
function resolveStoreSessionKey(
  entries: readonly SessionEntrySummary[],
  sessionKey: string
): string {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) return "";
  
  // Exact match
  if (entries.some(e => e.sessionKey === normalized)) return normalized;
  
  // Case-insensitive match
  for (const entry of entries) {
    if (normalizeSessionKey(entry.sessionKey) === normalized) {
      return entry.sessionKey;
    }
  }
  
  return normalized;
}

function resolveSessionStorePath(params: {
  sessionKey: string;
  cfg?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): { cfg: OpenClawConfig; storePath: string } {
  const cfg = params.cfg ?? getRuntimeConfig();
  const parsed = parseAgentSessionKey(params.sessionKey);
  const storePath = resolveStorePath(cfg.session?.store, {
    agentId: parsed?.agentId,
    env: params.env,
  });
  return { cfg, storePath };
}

function acpSessionRowMatchesEntry(
  row: AcpSessionRow,
  entry?: Pick<SessionEntry, "sessionId">
): boolean {
  return !row.session_id || row.session_id === entry?.sessionId;
}

// ===== Main Public Functions =====
export async function readAcpSessionMeta(params: {
  sessionKey: string;
  connection: Connection;
  cfg?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<SessionAcpMeta | undefined> {
  const sessionKey = normalizeSessionKey(params.sessionKey);
  if (!sessionKey) return undefined;

  const storeEntry = await readSessionEntryFromStore({
    sessionKey,
    cfg: params.cfg,
    env: params.env,
  });

  const row = await selectAcpSessionRow(params.connection, storeEntry.storeSessionKey);
  if (!row || !acpSessionRowMatchesEntry(row, storeEntry.entry)) {
    return undefined;
  }
  return rowToAcpSessionMeta(row);
}

export async function readAcpSessionMetaForEntry(params: {
  sessionKey: string;
  connection: Connection;
  entry?: Pick<SessionEntry, "sessionId">;
}): Promise<SessionAcpMeta | undefined> {
  const sessionKey = normalizeSessionKey(params.sessionKey);
  if (!sessionKey) return undefined;

  const row = await selectAcpSessionRow(params.connection, sessionKey);
  if (!row || !acpSessionRowMatchesEntry(row, params.entry)) {
    return undefined;
  }
  return rowToAcpSessionMeta(row);
}

export async function listAcpSessionEntries(params: {
  connection: Connection;
  cfg?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<AcpSessionStoreEntry[]> {
  const cfg = params.cfg ?? getRuntimeConfig();
  const rows = await selectAllAcpSessions(params.connection);
  const results: AcpSessionStoreEntry[] = [];

  for (const row of rows) {
    const { storePath } = resolveSessionStorePath({
      sessionKey: row.session_key,
      cfg,
      env: params.env,
    });

    let sessionEntries: SessionEntrySummary[];
    try {
      sessionEntries = listSessionEntries({ storePath });
    } catch {
      continue;
    }

    const storeSessionKey = resolveStoreSessionKey(sessionEntries, row.session_key);
    const entry = sessionEntries.find(e => e.sessionKey === storeSessionKey)?.entry;
    
    if (!entry || !acpSessionRowMatchesEntry(row, entry)) {
      continue;
    }

    results.push({
      cfg,
      storePath,
      sessionKey: row.session_key,
      storeSessionKey,
      entry,
      acp: rowToAcpSessionMeta(row),
    });
  }

  return results;
}

export async function upsertAcpSessionMeta(params: {
  sessionKey: string;
  connection: Connection;
  cfg?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  mutate: (
    current: SessionAcpMeta | undefined,
    entry: SessionEntry | undefined,
  ) => SessionAcpMeta | null | undefined;
}): Promise<SessionEntry | null> {
  const sessionKey = normalizeSessionKey(params.sessionKey);
  if (!sessionKey) return null;

  const storeEntry = await readSessionEntryFromStore({
    sessionKey,
    cfg: params.cfg,
    env: params.env,
  });

  const row = await selectAcpSessionRow(params.connection, storeEntry.storeSessionKey);
  const current = row && acpSessionRowMatchesEntry(row, storeEntry.entry)
    ? rowToAcpSessionMeta(row)
    : undefined;

  const nextMeta = params.mutate(current, storeEntry.entry);
  
  // No change
  if (nextMeta === undefined) {
    return current && storeEntry.entry 
      ? mergeSessionEntry(storeEntry.entry, { acp: current })
      : storeEntry.entry ?? null;
  }

  // Delete
  if (nextMeta === null) {
    await deleteAcpSessionRow(params.connection, storeEntry.storeSessionKey);
    return storeEntry.entry ?? null;
  }

  // Upsert
  const updatedAt = Date.now();
  const rowData = metaToRow({
    sessionKey: storeEntry.storeSessionKey,
    sessionId: storeEntry.entry?.sessionId,
    meta: nextMeta,
    updatedAt,
  });

  await upsertAcpSessionRow(params.connection, rowData);
  
  return storeEntry.entry 
    ? mergeSessionEntry(storeEntry.entry, { acp: nextMeta })
    : null;
}

// ===== Private Helpers =====
async function readSessionEntryFromStore(params: {
  sessionKey: string;
  cfg?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  cfg: OpenClawConfig;
  storePath: string;
  storeSessionKey: string;
  entry?: SessionEntry;
}> {
  const { cfg, storePath } = resolveSessionStorePath(params);
  try {
    const entries = listSessionEntries({ storePath });
    const storeSessionKey = resolveStoreSessionKey(entries, params.sessionKey);
    const entry = entries.find(e => e.sessionKey === storeSessionKey)?.entry;
    return { cfg, storePath, storeSessionKey, entry };
  } catch {
    return {
      cfg,
      storePath,
      storeSessionKey: normalizeSessionKey(params.sessionKey),
    };
  }
}