/**
 * Persists subagent run records in Oracle Database. The
 * store preserves typed columns for hot delivery state while retaining the
 * normalized payload JSON for forward-compatible record hydration.
 */
import { requireNodeOracle } from "../infra/node-oracle.ts";
import { normalizeDeliveryContext } from "../utils/delivery-context.shared.ts";
import { normalizeSubagentRunState } from "./subagent-delivery-state.ts";
import type {
  PendingFinalDeliveryPayload,
  SubagentCompletionDeliveryState,
  SubagentCompletionState,
  SubagentExecutionState,
  SubagentRunRecord,
} from "./subagent-registry.types.ts";

type SubagentRunRow = {
  RUN_ID: string;
  CHILD_SESSION_KEY: string;
  CONTROLLER_SESSION_KEY: string | null;
  REQUESTER_SESSION_KEY: string;
  REQUESTER_DISPLAY_KEY: string;
  REQUESTER_ORIGIN_JSON: string | null;
  TASK: string;
  TASK_NAME: string | null;
  CLEANUP: string;
  LABEL: string | null;
  MODEL: string | null;
  AGENT_DIR: string | null;
  WORKSPACE_DIR: string | null;
  RUN_TIMEOUT_SECONDS: number | null;
  SPAWN_MODE: string | null;
  CREATED_AT: number;
  STARTED_AT: number | null;
  SESSION_STARTED_AT: number | null;
  ACCUMULATED_RUNTIME_MS: number | null;
  ENDED_AT: number | null;
  OUTCOME_JSON: string | null;
  ARCHIVE_AT_MS: number | null;
  CLEANUP_COMPLETED_AT: number | null;
  CLEANUP_HANDLED: number | null;
  SUPPRESS_ANNOUNCE_REASON: string | null;
  EXPECTS_COMPLETION_MESSAGE: number | null;
  ANNOUNCE_RETRY_COUNT: number | null;
  LAST_ANNOUNCE_RETRY_AT: number | null;
  LAST_ANNOUNCE_DELIVERY_ERROR: string | null;
  ENDED_REASON: string | null;
  PAUSE_REASON: string | null;
  WAKE_ON_DESCENDANT_SETTLE: number | null;
  FROZEN_RESULT_TEXT: string | null;
  FROZEN_RESULT_CAPTURED_AT: number | null;
  FALLBACK_FROZEN_RESULT_TEXT: string | null;
  FALLBACK_FROZEN_RESULT_CAPTURED_AT: number | null;
  ENDED_HOOK_EMITTED_AT: number | null;
  PENDING_FINAL_DELIVERY: number | null;
  PENDING_FINAL_DELIVERY_CREATED_AT: number | null;
  PENDING_FINAL_DELIVERY_LAST_ATTEMPT_AT: number | null;
  PENDING_FINAL_DELIVERY_ATTEMPT_COUNT: number | null;
  PENDING_FINAL_DELIVERY_LAST_ERROR: string | null;
  PENDING_FINAL_DELIVERY_PAYLOAD_JSON: string | null;
  COMPLETION_ANNOUNCED_AT: number | null;
  PAYLOAD_JSON: string;
};

let pool: any = null;
let poolConfig: any = null;

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
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE subagent_runs (
          run_id VARCHAR2(64) PRIMARY KEY,
          child_session_key VARCHAR2(128) NOT NULL,
          controller_session_key VARCHAR2(128),
          requester_session_key VARCHAR2(128) NOT NULL,
          requester_display_key VARCHAR2(256) NOT NULL,
          requester_origin_json CLOB,
          task CLOB NOT NULL,
          task_name VARCHAR2(256),
          cleanup VARCHAR2(16) NOT NULL,
          label VARCHAR2(256),
          model VARCHAR2(128),
          agent_dir VARCHAR2(512),
          workspace_dir VARCHAR2(512),
          run_timeout_seconds NUMBER,
          spawn_mode VARCHAR2(16),
          created_at NUMBER NOT NULL,
          started_at NUMBER,
          session_started_at NUMBER,
          accumulated_runtime_ms NUMBER,
          ended_at NUMBER,
          outcome_json CLOB,
          archive_at_ms NUMBER,
          cleanup_completed_at NUMBER,
          cleanup_handled NUMBER,
          suppress_announce_reason VARCHAR2(32),
          expects_completion_message NUMBER,
          announce_retry_count NUMBER,
          last_announce_retry_at NUMBER,
          last_announce_delivery_error CLOB,
          ended_reason VARCHAR2(64),
          pause_reason VARCHAR2(32),
          wake_on_descendant_settle NUMBER,
          frozen_result_text CLOB,
          frozen_result_captured_at NUMBER,
          fallback_frozen_result_text CLOB,
          fallback_frozen_result_captured_at NUMBER,
          ended_hook_emitted_at NUMBER,
          pending_final_delivery NUMBER,
          pending_final_delivery_created_at NUMBER,
          pending_final_delivery_last_attempt_at NUMBER,
          pending_final_delivery_attempt_count NUMBER,
          pending_final_delivery_last_error CLOB,
          pending_final_delivery_payload_json CLOB,
          completion_announced_at NUMBER,
          payload_json CLOB NOT NULL
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_subagent_runs_created ON subagent_runs(created_at)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_subagent_runs_child ON subagent_runs(child_session_key)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.commit();
  } finally {
    await conn.close();
  }
}

function jsonStringify(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function boolToNumber(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

function numberToBool(value: number | null): boolean | undefined {
  return value == null ? undefined : value !== 0;
}

function normalizeFiniteNumber(value: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function createDeliveryFromRow(
  row: SubagentRunRow,
  fallback: SubagentCompletionDeliveryState | undefined,
): SubagentCompletionDeliveryState | undefined {
  const delivery = fallback ? { ...fallback } : undefined;
  const payload = parseJson(row.PENDING_FINAL_DELIVERY_PAYLOAD_JSON) as
    | PendingFinalDeliveryPayload
    | undefined;
  const status =
    row.EXPECTS_COMPLETION_MESSAGE === 0
      ? "not_required"
      : row.PENDING_FINAL_DELIVERY
        ? "pending"
        : delivery?.status;
  if (!status && row.COMPLETION_ANNOUNCED_AT == null && row.LAST_ANNOUNCE_DELIVERY_ERROR == null) {
    return delivery;
  }
  return {
    status: status ?? "pending",
    ...delivery,
    ...(payload ? { payload } : {}),
    ...(normalizeFiniteNumber(row.PENDING_FINAL_DELIVERY_CREATED_AT) !== undefined
      ? { createdAt: row.PENDING_FINAL_DELIVERY_CREATED_AT ?? undefined }
      : {}),
    ...(normalizeFiniteNumber(row.PENDING_FINAL_DELIVERY_LAST_ATTEMPT_AT) !== undefined
      ? { lastAttemptAt: row.PENDING_FINAL_DELIVERY_LAST_ATTEMPT_AT ?? undefined }
      : {}),
    ...(normalizeFiniteNumber(row.PENDING_FINAL_DELIVERY_ATTEMPT_COUNT) !== undefined
      ? { attemptCount: row.PENDING_FINAL_DELIVERY_ATTEMPT_COUNT ?? undefined }
      : {}),
    ...(row.PENDING_FINAL_DELIVERY_LAST_ERROR !== null
      ? { lastError: row.PENDING_FINAL_DELIVERY_LAST_ERROR }
      : {}),
    ...(row.COMPLETION_ANNOUNCED_AT !== null
      ? {
          status: "delivered",
          announcedAt: row.COMPLETION_ANNOUNCED_AT,
          deliveredAt: delivery?.deliveredAt ?? row.COMPLETION_ANNOUNCED_AT,
        }
      : {}),
  };
}

function rowToSubagentRunRecord(row: SubagentRunRow): SubagentRunRecord | null {
  const payload = (parseJson(row.PAYLOAD_JSON) as Partial<SubagentRunRecord> | undefined) ?? {};
  const requesterOrigin =
    (parseJson(row.REQUESTER_ORIGIN_JSON) as SubagentRunRecord["requesterOrigin"] | undefined) ??
    payload.requesterOrigin;
  const outcome =
    (parseJson(row.OUTCOME_JSON) as SubagentRunRecord["outcome"] | undefined) ?? payload.outcome;
  const completion: SubagentCompletionState | undefined = {
    ...(payload.completion ?? { required: row.EXPECTS_COMPLETION_MESSAGE === 1 }),
    required: payload.completion?.required ?? row.EXPECTS_COMPLETION_MESSAGE === 1,
    ...(row.FROZEN_RESULT_TEXT !== null ? { resultText: row.FROZEN_RESULT_TEXT } : {}),
    ...(row.FROZEN_RESULT_CAPTURED_AT !== null
      ? { capturedAt: row.FROZEN_RESULT_CAPTURED_AT }
      : {}),
    ...(row.FALLBACK_FROZEN_RESULT_TEXT !== null
      ? { fallbackResultText: row.FALLBACK_FROZEN_RESULT_TEXT }
      : {}),
    ...(row.FALLBACK_FROZEN_RESULT_CAPTURED_AT !== null
      ? { fallbackCapturedAt: row.FALLBACK_FROZEN_RESULT_CAPTURED_AT }
      : {}),
  };
  const execution: SubagentExecutionState | undefined = payload.execution
    ? {
        ...payload.execution,
        ...(row.STARTED_AT !== null ? { startedAt: row.STARTED_AT } : {}),
        ...(row.ENDED_AT !== null ? { status: "terminal", endedAt: row.ENDED_AT, outcome } : {}),
      }
    : undefined;
  const delivery = createDeliveryFromRow(row, payload.delivery);
  const record = normalizeSubagentRunState({
    ...payload,
    runId: row.RUN_ID,
    childSessionKey: row.CHILD_SESSION_KEY,
    ...(row.CONTROLLER_SESSION_KEY ? { controllerSessionKey: row.CONTROLLER_SESSION_KEY } : {}),
    requesterSessionKey: row.REQUESTER_SESSION_KEY,
    ...(requesterOrigin ? { requesterOrigin: normalizeDeliveryContext(requesterOrigin) } : {}),
    requesterDisplayKey: row.REQUESTER_DISPLAY_KEY,
    task: row.TASK,
    cleanup: row.CLEANUP === "delete" ? "delete" : "keep",
    ...(row.TASK_NAME ? { taskName: row.TASK_NAME } : {}),
    ...(row.LABEL ? { label: row.LABEL } : {}),
    ...(row.MODEL ? { model: row.MODEL } : {}),
    ...(row.AGENT_DIR ? { agentDir: row.AGENT_DIR } : {}),
    ...(row.WORKSPACE_DIR ? { workspaceDir: row.WORKSPACE_DIR } : {}),
    ...(row.RUN_TIMEOUT_SECONDS !== null ? { runTimeoutSeconds: row.RUN_TIMEOUT_SECONDS } : {}),
    ...(row.SPAWN_MODE === "session" || row.SPAWN_MODE === "run"
      ? { spawnMode: row.SPAWN_MODE }
      : {}),
    createdAt: row.CREATED_AT,
    ...(row.STARTED_AT !== null ? { startedAt: row.STARTED_AT } : {}),
    ...(row.SESSION_STARTED_AT !== null ? { sessionStartedAt: row.SESSION_STARTED_AT } : {}),
    ...(row.ACCUMULATED_RUNTIME_MS !== null
      ? { accumulatedRuntimeMs: row.ACCUMULATED_RUNTIME_MS }
      : {}),
    ...(row.ENDED_AT !== null ? { endedAt: row.ENDED_AT } : {}),
    ...(outcome ? { outcome } : {}),
    ...(row.ARCHIVE_AT_MS !== null ? { archiveAtMs: row.ARCHIVE_AT_MS } : {}),
    ...(row.CLEANUP_COMPLETED_AT !== null ? { cleanupCompletedAt: row.CLEANUP_COMPLETED_AT } : {}),
    ...(numberToBool(row.CLEANUP_HANDLED) !== undefined
      ? { cleanupHandled: numberToBool(row.CLEANUP_HANDLED) }
      : {}),
    ...(row.SUPPRESS_ANNOUNCE_REASON === "steer-restart" || row.SUPPRESS_ANNOUNCE_REASON === "killed"
      ? { suppressAnnounceReason: row.SUPPRESS_ANNOUNCE_REASON }
      : {}),
    ...(numberToBool(row.EXPECTS_COMPLETION_MESSAGE) !== undefined
      ? { expectsCompletionMessage: numberToBool(row.EXPECTS_COMPLETION_MESSAGE) }
      : {}),
    ...(row.ENDED_REASON
      ? { endedReason: row.ENDED_REASON as SubagentRunRecord["endedReason"] }
      : {}),
    ...(row.PAUSE_REASON === "sessions_yield" ? { pauseReason: row.PAUSE_REASON } : {}),
    ...(numberToBool(row.WAKE_ON_DESCENDANT_SETTLE) !== undefined
      ? { wakeOnDescendantSettle: numberToBool(row.WAKE_ON_DESCENDANT_SETTLE) }
      : {}),
    ...(execution ? { execution } : {}),
    completion,
    ...(row.ENDED_HOOK_EMITTED_AT !== null
      ? { endedHookEmittedAt: row.ENDED_HOOK_EMITTED_AT }
      : {}),
    ...(delivery ? { delivery } : {}),
  });
  return record.runId && record.childSessionKey && record.requesterSessionKey ? record : null;
}

function subagentRunRecordToRow(entry: SubagentRunRecord): SubagentRunRow {
  const normalized = normalizeSubagentRunState(structuredClone(entry));
  const delivery = normalized.delivery;
  const completion = normalized.completion;
  return {
    RUN_ID: normalized.runId,
    CHILD_SESSION_KEY: normalized.childSessionKey,
    CONTROLLER_SESSION_KEY: normalized.controllerSessionKey ?? null,
    REQUESTER_SESSION_KEY: normalized.requesterSessionKey,
    REQUESTER_DISPLAY_KEY: normalized.requesterDisplayKey,
    REQUESTER_ORIGIN_JSON: jsonStringify(normalized.requesterOrigin),
    TASK: normalized.task,
    TASK_NAME: normalized.taskName ?? null,
    CLEANUP: normalized.cleanup,
    LABEL: normalized.label ?? null,
    MODEL: normalized.model ?? null,
    AGENT_DIR: normalized.agentDir ?? null,
    WORKSPACE_DIR: normalized.workspaceDir ?? null,
    RUN_TIMEOUT_SECONDS: normalized.runTimeoutSeconds ?? null,
    SPAWN_MODE: normalized.spawnMode ?? null,
    CREATED_AT: normalized.createdAt,
    STARTED_AT: normalized.startedAt ?? null,
    SESSION_STARTED_AT: normalized.sessionStartedAt ?? null,
    ACCUMULATED_RUNTIME_MS: normalized.accumulatedRuntimeMs ?? null,
    ENDED_AT: normalized.endedAt ?? null,
    OUTCOME_JSON: jsonStringify(normalized.outcome),
    ARCHIVE_AT_MS: normalized.archiveAtMs ?? null,
    CLEANUP_COMPLETED_AT: normalized.cleanupCompletedAt ?? null,
    CLEANUP_HANDLED: boolToNumber(normalized.cleanupHandled),
    SUPPRESS_ANNOUNCE_REASON: normalized.suppressAnnounceReason ?? null,
    EXPECTS_COMPLETION_MESSAGE: boolToNumber(normalized.expectsCompletionMessage),
    ANNOUNCE_RETRY_COUNT: delivery?.attemptCount ?? null,
    LAST_ANNOUNCE_RETRY_AT: delivery?.lastAttemptAt ?? null,
    LAST_ANNOUNCE_DELIVERY_ERROR: delivery?.lastError ?? null,
    ENDED_REASON: normalized.endedReason ?? null,
    PAUSE_REASON: normalized.pauseReason ?? null,
    WAKE_ON_DESCENDANT_SETTLE: boolToNumber(normalized.wakeOnDescendantSettle),
    FROZEN_RESULT_TEXT: completion?.resultText ?? null,
    FROZEN_RESULT_CAPTURED_AT: completion?.capturedAt ?? null,
    FALLBACK_FROZEN_RESULT_TEXT: completion?.fallbackResultText ?? null,
    FALLBACK_FROZEN_RESULT_CAPTURED_AT: completion?.fallbackCapturedAt ?? null,
    ENDED_HOOK_EMITTED_AT: normalized.endedHookEmittedAt ?? null,
    PENDING_FINAL_DELIVERY: boolToNumber(delivery?.status === "pending" || Boolean(delivery?.payload)),
    PENDING_FINAL_DELIVERY_CREATED_AT: delivery?.createdAt ?? null,
    PENDING_FINAL_DELIVERY_LAST_ATTEMPT_AT: delivery?.lastAttemptAt ?? null,
    PENDING_FINAL_DELIVERY_ATTEMPT_COUNT: delivery?.attemptCount ?? null,
    PENDING_FINAL_DELIVERY_LAST_ERROR: delivery?.lastError ?? null,
    PENDING_FINAL_DELIVERY_PAYLOAD_JSON: jsonStringify(delivery?.payload),
    COMPLETION_ANNOUNCED_AT: delivery?.announcedAt ?? null,
    PAYLOAD_JSON: JSON.stringify(normalized),
  };
}

async function loadSubagentRuns(): Promise<Map<string, SubagentRunRecord>> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT * FROM subagent_runs ORDER BY created_at ASC, run_id ASC`
    );
    const runs = new Map<string, SubagentRunRecord>();
    for (const row of result.rows as SubagentRunRow[]) {
      const entry = rowToSubagentRunRecord(row);
      if (entry) {
        runs.set(entry.runId, entry);
      }
    }
    return runs;
  } finally {
    await conn.close();
  }
}

/** Loads subagent runs from Oracle. */
export async function loadSubagentRegistryFromSqlite(): Promise<Map<string, SubagentRunRecord>> {
  await ensureSchema();
  const runs = await loadSubagentRuns();
  if (runs.size > 0) {
    return runs;
  }
  return await loadSubagentRuns();
}

/** Saves the complete subagent run snapshot to Oracle. */
export async function saveSubagentRegistryToSqlite(runs: Map<string, SubagentRunRecord>): Promise<void> {
  await ensureSchema();
  const conn = await getConnection();
  try {
    const runIds: string[] = [];
    for (const entry of runs.values()) {
      const row = subagentRunRecordToRow(entry);
      runIds.push(row.RUN_ID);
      await conn.execute(
        `MERGE INTO subagent_runs t
         USING (SELECT :run_id AS run_id FROM DUAL) s
         ON (t.run_id = s.run_id)
         WHEN MATCHED THEN UPDATE SET
           child_session_key = :child_session_key,
           controller_session_key = :controller_session_key,
           requester_session_key = :requester_session_key,
           requester_display_key = :requester_display_key,
           requester_origin_json = :requester_origin_json,
           task = :task,
           task_name = :task_name,
           cleanup = :cleanup,
           label = :label,
           model = :model,
           agent_dir = :agent_dir,
           workspace_dir = :workspace_dir,
           run_timeout_seconds = :run_timeout_seconds,
           spawn_mode = :spawn_mode,
           created_at = :created_at,
           started_at = :started_at,
           session_started_at = :session_started_at,
           accumulated_runtime_ms = :accumulated_runtime_ms,
           ended_at = :ended_at,
           outcome_json = :outcome_json,
           archive_at_ms = :archive_at_ms,
           cleanup_completed_at = :cleanup_completed_at,
           cleanup_handled = :cleanup_handled,
           suppress_announce_reason = :suppress_announce_reason,
           expects_completion_message = :expects_completion_message,
           announce_retry_count = :announce_retry_count,
           last_announce_retry_at = :last_announce_retry_at,
           last_announce_delivery_error = :last_announce_delivery_error,
           ended_reason = :ended_reason,
           pause_reason = :pause_reason,
           wake_on_descendant_settle = :wake_on_descendant_settle,
           frozen_result_text = :frozen_result_text,
           frozen_result_captured_at = :frozen_result_captured_at,
           fallback_frozen_result_text = :fallback_frozen_result_text,
           fallback_frozen_result_captured_at = :fallback_frozen_result_captured_at,
           ended_hook_emitted_at = :ended_hook_emitted_at,
           pending_final_delivery = :pending_final_delivery,
           pending_final_delivery_created_at = :pending_final_delivery_created_at,
           pending_final_delivery_last_attempt_at = :pending_final_delivery_last_attempt_at,
           pending_final_delivery_attempt_count = :pending_final_delivery_attempt_count,
           pending_final_delivery_last_error = :pending_final_delivery_last_error,
           pending_final_delivery_payload_json = :pending_final_delivery_payload_json,
           completion_announced_at = :completion_announced_at,
           payload_json = :payload_json`,
        row
      );
    }

    if (runIds.length > 0) {
      const placeholders = runIds.map(() => ":id").join(", ");
      await conn.execute(
        `DELETE FROM subagent_runs WHERE run_id NOT IN (${placeholders})`,
        runIds.map((id) => ({ id }))
      );
    } else {
      await conn.execute(`DELETE FROM subagent_runs`);
    }

    await conn.commit();
  } catch (err) {
    await conn.execute("ROLLBACK");
    throw err;
  } finally {
    await conn.close();
  }
}