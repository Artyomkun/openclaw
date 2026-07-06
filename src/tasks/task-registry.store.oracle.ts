// Persists task registry records and events through Oracle Database.
import { requireNodeOracle } from "../infra/node-oracle.ts";
import { parseDeliveryContextJson } from "./task-registry.oracle.shared.ts";
import type { TaskRegistryStoreSnapshot } from "./task-registry.store.types.ts";
import {
  parseOptionalTaskTerminalOutcome,
  parseTaskDeliveryStatus,
  parseTaskNotifyPolicy,
  parseTaskRuntime,
  parseTaskScopeKind,
  parseTaskStatus,
  type TaskDeliveryState,
  type TaskRecord,
} from "./task-registry.types.ts";

type TaskRegistryRow = {
  TASK_ID: string;
  RUNTIME: string;
  TASK_KIND: string | null;
  SOURCE_ID: string | null;
  REQUESTER_SESSION_KEY: string;
  OWNER_KEY: string;
  SCOPE_KIND: string;
  CHILD_SESSION_KEY: string | null;
  PARENT_FLOW_ID: string | null;
  PARENT_TASK_ID: string | null;
  AGENT_ID: string | null;
  REQUESTER_AGENT_ID: string | null;
  RUN_ID: string | null;
  LABEL: string | null;
  TASK: string;
  STATUS: string;
  DELIVERY_STATUS: string;
  NOTIFY_POLICY: string;
  CREATED_AT: number;
  STARTED_AT: number | null;
  ENDED_AT: number | null;
  LAST_EVENT_AT: number | null;
  CLEANUP_AFTER: number | null;
  ERROR: string | null;
  PROGRESS_SUMMARY: string | null;
  TERMINAL_SUMMARY: string | null;
  TERMINAL_OUTCOME: string | null;
};

type TaskDeliveryStateRow = {
  TASK_ID: string;
  REQUESTER_ORIGIN_JSON: string | null;
  LAST_NOTIFIED_EVENT_AT: number | null;
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
    // Таблица task_runs
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE task_runs (
          task_id VARCHAR2(128) PRIMARY KEY,
          runtime VARCHAR2(32) NOT NULL,
          task_kind VARCHAR2(64),
          source_id VARCHAR2(128),
          requester_session_key VARCHAR2(128) NOT NULL,
          owner_key VARCHAR2(128) NOT NULL,
          scope_kind VARCHAR2(32) NOT NULL,
          child_session_key VARCHAR2(128),
          parent_flow_id VARCHAR2(128),
          parent_task_id VARCHAR2(128),
          agent_id VARCHAR2(128),
          requester_agent_id VARCHAR2(128),
          run_id VARCHAR2(128),
          label VARCHAR2(256),
          task CLOB NOT NULL,
          status VARCHAR2(32) NOT NULL,
          delivery_status VARCHAR2(32) NOT NULL,
          notify_policy VARCHAR2(32) NOT NULL,
          created_at NUMBER NOT NULL,
          started_at NUMBER,
          ended_at NUMBER,
          last_event_at NUMBER,
          cleanup_after NUMBER,
          error CLOB,
          progress_summary CLOB,
          terminal_summary CLOB,
          terminal_outcome VARCHAR2(32)
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    // Таблица task_delivery_state
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE task_delivery_state (
          task_id VARCHAR2(128) PRIMARY KEY,
          requester_origin_json CLOB,
          last_notified_event_at NUMBER
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    // Индексы
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_task_runs_owner ON task_runs(owner_key)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_task_runs_status ON task_runs(status)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_task_runs_created ON task_runs(created_at)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.commit();
  } finally {
    await conn.close();
  }
}

function serializeJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function rowToTaskRecord(row: TaskRegistryRow): TaskRecord {
  const scopeKind = parseTaskScopeKind(row.SCOPE_KIND);
  const terminalOutcome = parseOptionalTaskTerminalOutcome(row.TERMINAL_OUTCOME);
  const requesterSessionKey =
    scopeKind === "system" ? "" : row.REQUESTER_SESSION_KEY?.trim() || row.OWNER_KEY;

  return {
    taskId: row.TASK_ID,
    runtime: parseTaskRuntime(row.RUNTIME),
    ...(row.TASK_KIND ? { taskKind: row.TASK_KIND } : {}),
    ...(row.SOURCE_ID ? { sourceId: row.SOURCE_ID } : {}),
    requesterSessionKey,
    ownerKey: row.OWNER_KEY,
    scopeKind,
    ...(row.CHILD_SESSION_KEY ? { childSessionKey: row.CHILD_SESSION_KEY } : {}),
    ...(row.PARENT_FLOW_ID ? { parentFlowId: row.PARENT_FLOW_ID } : {}),
    ...(row.PARENT_TASK_ID ? { parentTaskId: row.PARENT_TASK_ID } : {}),
    ...(row.AGENT_ID ? { agentId: row.AGENT_ID } : {}),
    ...(row.REQUESTER_AGENT_ID ? { requesterAgentId: row.REQUESTER_AGENT_ID } : {}),
    ...(row.RUN_ID ? { runId: row.RUN_ID } : {}),
    ...(row.LABEL ? { label: row.LABEL } : {}),
    task: row.TASK,
    status: parseTaskStatus(row.STATUS),
    deliveryStatus: parseTaskDeliveryStatus(row.DELIVERY_STATUS),
    notifyPolicy: parseTaskNotifyPolicy(row.NOTIFY_POLICY),
    createdAt: Number(row.CREATED_AT) ?? 0,
    ...(row.STARTED_AT != null ? { startedAt: row.STARTED_AT } : {}),
    ...(row.ENDED_AT != null ? { endedAt: row.ENDED_AT } : {}),
    ...(row.LAST_EVENT_AT != null ? { lastEventAt: row.LAST_EVENT_AT } : {}),
    ...(row.CLEANUP_AFTER != null ? { cleanupAfter: row.CLEANUP_AFTER } : {}),
    ...(row.ERROR ? { error: row.ERROR } : {}),
    ...(row.PROGRESS_SUMMARY ? { progressSummary: row.PROGRESS_SUMMARY } : {}),
    ...(row.TERMINAL_SUMMARY ? { terminalSummary: row.TERMINAL_SUMMARY } : {}),
    ...(terminalOutcome ? { terminalOutcome } : {}),
  };
}

function rowToTaskDeliveryState(row: TaskDeliveryStateRow): TaskDeliveryState {
  const requesterOrigin = parseDeliveryContextJson(row.REQUESTER_ORIGIN_JSON);
  return {
    taskId: row.TASK_ID,
    ...(requesterOrigin ? { requesterOrigin } : {}),
    ...(row.LAST_NOTIFIED_EVENT_AT != null ? { lastNotifiedEventAt: row.LAST_NOTIFIED_EVENT_AT } : {}),
  };
}

function bindTaskRecordBase(record: TaskRecord): TaskRegistryRow {
  return {
    TASK_ID: record.taskId,
    RUNTIME: record.runtime,
    TASK_KIND: record.taskKind ?? null,
    SOURCE_ID: record.sourceId ?? null,
    REQUESTER_SESSION_KEY: record.scopeKind === "system" ? "" : record.requesterSessionKey,
    OWNER_KEY: record.ownerKey,
    SCOPE_KIND: record.scopeKind,
    CHILD_SESSION_KEY: record.childSessionKey ?? null,
    PARENT_FLOW_ID: record.parentFlowId ?? null,
    PARENT_TASK_ID: record.parentTaskId ?? null,
    AGENT_ID: record.agentId ?? null,
    REQUESTER_AGENT_ID: record.requesterAgentId ?? null,
    RUN_ID: record.runId ?? null,
    LABEL: record.label ?? null,
    TASK: record.task,
    STATUS: record.status,
    DELIVERY_STATUS: record.deliveryStatus,
    NOTIFY_POLICY: record.notifyPolicy,
    CREATED_AT: record.createdAt,
    STARTED_AT: record.startedAt ?? null,
    ENDED_AT: record.endedAt ?? null,
    LAST_EVENT_AT: record.lastEventAt ?? null,
    CLEANUP_AFTER: record.cleanupAfter ?? null,
    ERROR: record.error ?? null,
    PROGRESS_SUMMARY: record.progressSummary ?? null,
    TERMINAL_SUMMARY: record.terminalSummary ?? null,
    TERMINAL_OUTCOME: record.terminalOutcome ?? null,
  };
}

function bindTaskDeliveryState(state: TaskDeliveryState): TaskDeliveryStateRow {
  return {
    TASK_ID: state.taskId,
    REQUESTER_ORIGIN_JSON: serializeJson(state.requesterOrigin),
    LAST_NOTIFIED_EVENT_AT: state.lastNotifiedEventAt ?? null,
  };
}

async function selectTaskRows(): Promise<TaskRegistryRow[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT task_id, runtime, task_kind, source_id, requester_session_key,
              owner_key, scope_kind, child_session_key, parent_flow_id,
              parent_task_id, agent_id, requester_agent_id, run_id,
              label, task, status, delivery_status, notify_policy,
              created_at, started_at, ended_at, last_event_at,
              cleanup_after, error, progress_summary, terminal_summary,
              terminal_outcome
       FROM task_runs
       ORDER BY created_at ASC, task_id ASC`
    );
    return result.rows as TaskRegistryRow[];
  } finally {
    await conn.close();
  }
}

async function selectTaskDeliveryStateRows(): Promise<TaskDeliveryStateRow[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT task_id, requester_origin_json, last_notified_event_at
       FROM task_delivery_state
       ORDER BY task_id ASC`
    );
    return result.rows as TaskDeliveryStateRow[];
  } finally {
    await conn.close();
  }
}

async function upsertTaskRow(row: TaskRegistryRow): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `MERGE INTO task_runs t
       USING (SELECT :task_id AS task_id FROM DUAL) s
       ON (t.task_id = s.task_id)
       WHEN MATCHED THEN UPDATE SET
         runtime = :runtime,
         task_kind = :task_kind,
         source_id = :source_id,
         requester_session_key = :requester_session_key,
         owner_key = :owner_key,
         scope_kind = :scope_kind,
         child_session_key = :child_session_key,
         parent_flow_id = :parent_flow_id,
         parent_task_id = :parent_task_id,
         agent_id = :agent_id,
         requester_agent_id = :requester_agent_id,
         run_id = :run_id,
         label = :label,
         task = :task,
         status = :status,
         delivery_status = :delivery_status,
         notify_policy = :notify_policy,
         created_at = :created_at,
         started_at = :started_at,
         ended_at = :ended_at,
         last_event_at = :last_event_at,
         cleanup_after = :cleanup_after,
         error = :error,
         progress_summary = :progress_summary,
         terminal_summary = :terminal_summary,
         terminal_outcome = :terminal_outcome
       WHEN NOT MATCHED THEN INSERT
         (task_id, runtime, task_kind, source_id, requester_session_key,
          owner_key, scope_kind, child_session_key, parent_flow_id,
          parent_task_id, agent_id, requester_agent_id, run_id,
          label, task, status, delivery_status, notify_policy,
          created_at, started_at, ended_at, last_event_at,
          cleanup_after, error, progress_summary, terminal_summary,
          terminal_outcome)
       VALUES
         (:task_id, :runtime, :task_kind, :source_id, :requester_session_key,
          :owner_key, :scope_kind, :child_session_key, :parent_flow_id,
          :parent_task_id, :agent_id, :requester_agent_id, :run_id,
          :label, :task, :status, :delivery_status, :notify_policy,
          :created_at, :started_at, :ended_at, :last_event_at,
          :cleanup_after, :error, :progress_summary, :terminal_summary,
          :terminal_outcome)`,
      row
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

async function replaceTaskDeliveryStateRow(row: TaskDeliveryStateRow): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `MERGE INTO task_delivery_state t
       USING (SELECT :task_id AS task_id FROM DUAL) s
       ON (t.task_id = s.task_id)
       WHEN MATCHED THEN UPDATE SET
         requester_origin_json = :requester_origin_json,
         last_notified_event_at = :last_notified_event_at
       WHEN NOT MATCHED THEN INSERT
         (task_id, requester_origin_json, last_notified_event_at)
       VALUES
         (:task_id, :requester_origin_json, :last_notified_event_at)`,
      row
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

async function deleteTaskRowsWithDeliveryState(taskId: string): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(`DELETE FROM task_delivery_state WHERE task_id = :task_id`, { task_id: taskId });
    await conn.execute(`DELETE FROM task_runs WHERE task_id = :task_id`, { task_id: taskId });
    await conn.commit();
  } finally {
    await conn.close();
  }
}

async function pruneRowsNotInSnapshot(params: {
  tableName: string;
  ids: readonly string[];
}): Promise<void> {
  if (params.ids.length === 0) {
    const conn = await getConnection();
    try {
      await conn.execute(`DELETE FROM ${params.tableName}`);
      await conn.commit();
    } finally {
      await conn.close();
    }
    return;
  }

  const conn = await getConnection();
  try {
    const placeholders = params.ids.map(() => '?').join(',');
    await conn.execute(
      `DELETE FROM ${params.tableName} WHERE task_id NOT IN (${placeholders})`,
      params.ids
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function loadTaskRegistryState(): Promise<TaskRegistryStoreSnapshot> {
  await ensureSchema();
  const taskRows = await selectTaskRows();
  const deliveryRows = await selectTaskDeliveryStateRows();
  return {
    tasks: new Map(taskRows.map((row) => [row.TASK_ID, rowToTaskRecord(row)])),
    deliveryStates: new Map(deliveryRows.map((row) => [row.TASK_ID, rowToTaskDeliveryState(row)])),
  };
}

export async function listTaskRegistryRecordsByOwnerKey(ownerKey: string): Promise<TaskRecord[]> {
  const key = ownerKey.trim();
  if (!key) return [];
  
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT task_id, runtime, task_kind, source_id, requester_session_key,
              owner_key, scope_kind, child_session_key, parent_flow_id,
              parent_task_id, agent_id, requester_agent_id, run_id,
              label, task, status, delivery_status, notify_policy,
              created_at, started_at, ended_at, last_event_at,
              cleanup_after, error, progress_summary, terminal_summary,
              terminal_outcome
       FROM task_runs
       WHERE owner_key = :owner_key
       ORDER BY created_at ASC, task_id ASC`,
      { owner_key: key }
    );
    return (result.rows as TaskRegistryRow[]).map(rowToTaskRecord);
  } finally {
    await conn.close();
  }
}

export async function saveTaskRegistryState(snapshot: TaskRegistryStoreSnapshot): Promise<void> {
  await ensureSchema();
  
  const taskIds = [...snapshot.tasks.keys()];
  await pruneRowsNotInSnapshot({ tableName: "task_runs", ids: taskIds });

  const deliveryTaskIds = [...snapshot.deliveryStates.keys()];
  if (deliveryTaskIds.length === 0) {
    const conn = await getConnection();
    try {
      await conn.execute(`DELETE FROM task_delivery_state`);
      await conn.commit();
    } finally {
      await conn.close();
    }
  } else {
    await pruneRowsNotInSnapshot({ tableName: "task_delivery_state", ids: deliveryTaskIds });
  }

  for (const task of snapshot.tasks.values()) {
    await upsertTaskRow(bindTaskRecordBase(task));
  }
  for (const state of snapshot.deliveryStates.values()) {
    await replaceTaskDeliveryStateRow(bindTaskDeliveryState(state));
  }
}

export async function upsertTaskRegistryRecord(task: TaskRecord): Promise<void> {
  await ensureSchema();
  await upsertTaskRow(bindTaskRecordBase(task));
}

export async function upsertTaskWithDeliveryState(params: {
  task: TaskRecord;
  deliveryState?: TaskDeliveryState;
}): Promise<void> {
  await ensureSchema();
  await upsertTaskRow(bindTaskRecordBase(params.task));
  if (params.deliveryState) {
    await replaceTaskDeliveryStateRow(bindTaskDeliveryState(params.deliveryState));
  } else {
    const conn = await getConnection();
    try {
      await conn.execute(`DELETE FROM task_delivery_state WHERE task_id = :task_id`, {
        task_id: params.task.taskId,
      });
      await conn.commit();
    } finally {
      await conn.close();
    }
  }
}

export async function deleteTaskRegistryRecord(taskId: string): Promise<void> {
  await ensureSchema();
  await deleteTaskRowsWithDeliveryState(taskId);
}

export async function deleteTaskAndDeliveryState(taskId: string): Promise<void> {
  await ensureSchema();
  await deleteTaskRowsWithDeliveryState(taskId);
}

export async function upsertTaskDeliveryState(state: TaskDeliveryState): Promise<void> {
  await ensureSchema();
  await replaceTaskDeliveryStateRow(bindTaskDeliveryState(state));
}

export async function deleteTaskDeliveryState(taskId: string): Promise<void> {
  await ensureSchema();
  const conn = await getConnection();
  try {
    await conn.execute(`DELETE FROM task_delivery_state WHERE task_id = :task_id`, { task_id: taskId });
    await conn.commit();
  } finally {
    await conn.close();
  }
}