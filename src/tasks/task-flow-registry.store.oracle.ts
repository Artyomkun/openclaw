// Persists managed task-flow records through Oracle Database.
import { requireNodeOracle } from "../infra/node-oracle.ts";
import type { TaskFlowRegistryStoreSnapshot } from "./task-flow-registry.store.types.ts";
import {
  parseOptionalTaskFlowSyncMode,
  parseTaskFlowStatus,
  type JsonValue,
  type TaskFlowRecord,
  type TaskFlowSyncMode,
} from "./task-flow-registry.types.ts";
import { parseDeliveryContextJson } from "./task-registry.oracle.shared.ts";
import { parseTaskNotifyPolicy } from "./task-registry.types.ts";

type FlowRegistryRow = {
  FLOW_ID: string;
  SYNC_MODE: string | null;
  SHAPE: string | null;
  OWNER_KEY: string;
  REQUESTER_ORIGIN_JSON: string | null;
  CONTROLLER_ID: string | null;
  REVISION: number;
  STATUS: string;
  NOTIFY_POLICY: string;
  GOAL: string;
  CURRENT_STEP: string | null;
  BLOCKED_TASK_ID: string | null;
  BLOCKED_SUMMARY: string | null;
  STATE_JSON: string | null;
  WAIT_JSON: string | null;
  CANCEL_REQUESTED_AT: number | null;
  CREATED_AT: number;
  UPDATED_AT: number;
  ENDED_AT: number | null;
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
        EXECUTE IMMEDIATE 'CREATE TABLE flow_runs (
          flow_id VARCHAR2(128) PRIMARY KEY,
          sync_mode VARCHAR2(32),
          shape VARCHAR2(32),
          owner_key VARCHAR2(128) NOT NULL,
          requester_origin_json CLOB,
          controller_id VARCHAR2(128),
          revision NUMBER NOT NULL,
          status VARCHAR2(32) NOT NULL,
          notify_policy VARCHAR2(32) NOT NULL,
          goal CLOB NOT NULL,
          current_step VARCHAR2(128),
          blocked_task_id VARCHAR2(128),
          blocked_summary CLOB,
          state_json CLOB,
          wait_json CLOB,
          cancel_requested_at NUMBER,
          created_at NUMBER NOT NULL,
          updated_at NUMBER NOT NULL,
          ended_at NUMBER
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_flow_runs_owner ON flow_runs(owner_key)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_flow_runs_status ON flow_runs(status)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_flow_runs_created ON flow_runs(created_at)';
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
  return value === undefined ? null : JSON.stringify(value);
}

function parseJsonValue(raw: string | null): JsonValue | undefined {
  if (!raw?.trim()) return undefined;
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return undefined;
  }
}

function rowToSyncMode(row: FlowRegistryRow): TaskFlowSyncMode {
  const syncMode = parseOptionalTaskFlowSyncMode(row.SYNC_MODE);
  if (syncMode) return syncMode;
  return row.SHAPE === "single_task" ? "task_mirrored" : "managed";
}

function rowToFlowRecord(row: FlowRegistryRow): TaskFlowRecord {
  const requesterOrigin = parseDeliveryContextJson(row.REQUESTER_ORIGIN_JSON);
  const stateJson = parseJsonValue(row.STATE_JSON);
  const waitJson = parseJsonValue(row.WAIT_JSON);
  return {
    flowId: row.FLOW_ID,
    syncMode: rowToSyncMode(row),
    ownerKey: row.OWNER_KEY,
    ...(requesterOrigin ? { requesterOrigin } : {}),
    ...(row.CONTROLLER_ID ? { controllerId: row.CONTROLLER_ID } : {}),
    revision: Number(row.REVISION) ?? 0,
    status: parseTaskFlowStatus(row.STATUS),
    notifyPolicy: parseTaskNotifyPolicy(row.NOTIFY_POLICY),
    goal: row.GOAL,
    ...(row.CURRENT_STEP ? { currentStep: row.CURRENT_STEP } : {}),
    ...(row.BLOCKED_TASK_ID ? { blockedTaskId: row.BLOCKED_TASK_ID } : {}),
    ...(row.BLOCKED_SUMMARY ? { blockedSummary: row.BLOCKED_SUMMARY } : {}),
    ...(stateJson !== undefined ? { stateJson } : {}),
    ...(waitJson !== undefined ? { waitJson } : {}),
    ...(row.CANCEL_REQUESTED_AT != null ? { cancelRequestedAt: row.CANCEL_REQUESTED_AT } : {}),
    createdAt: Number(row.CREATED_AT) ?? 0,
    updatedAt: Number(row.UPDATED_AT) ?? 0,
    ...(row.ENDED_AT != null ? { endedAt: row.ENDED_AT } : {}),
  };
}

function bindFlowRecord(record: TaskFlowRecord): FlowRegistryRow {
  return {
    FLOW_ID: record.flowId,
    SYNC_MODE: record.syncMode,
    SHAPE: null,
    OWNER_KEY: record.ownerKey,
    REQUESTER_ORIGIN_JSON: serializeJson(record.requesterOrigin),
    CONTROLLER_ID: record.controllerId ?? null,
    REVISION: record.revision,
    STATUS: record.status,
    NOTIFY_POLICY: record.notifyPolicy,
    GOAL: record.goal,
    CURRENT_STEP: record.currentStep ?? null,
    BLOCKED_TASK_ID: record.blockedTaskId ?? null,
    BLOCKED_SUMMARY: record.blockedSummary ?? null,
    STATE_JSON: serializeJson(record.stateJson),
    WAIT_JSON: serializeJson(record.waitJson),
    CANCEL_REQUESTED_AT: record.cancelRequestedAt ?? null,
    CREATED_AT: record.createdAt,
    UPDATED_AT: record.updatedAt,
    ENDED_AT: record.endedAt ?? null,
  };
}

async function selectFlowRows(): Promise<FlowRegistryRow[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT flow_id, sync_mode, shape, owner_key, requester_origin_json,
              controller_id, revision, status, notify_policy, goal,
              current_step, blocked_task_id, blocked_summary,
              state_json, wait_json, cancel_requested_at,
              created_at, updated_at, ended_at
       FROM flow_runs
       ORDER BY created_at ASC, flow_id ASC`
    );
    return result.rows as FlowRegistryRow[];
  } finally {
    await conn.close();
  }
}

async function upsertFlowRow(row: FlowRegistryRow): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `MERGE INTO flow_runs t
       USING (SELECT :flow_id AS flow_id FROM DUAL) s
       ON (t.flow_id = s.flow_id)
       WHEN MATCHED THEN UPDATE SET
         sync_mode = :sync_mode,
         shape = :shape,
         owner_key = :owner_key,
         requester_origin_json = :requester_origin_json,
         controller_id = :controller_id,
         revision = :revision,
         status = :status,
         notify_policy = :notify_policy,
         goal = :goal,
         current_step = :current_step,
         blocked_task_id = :blocked_task_id,
         blocked_summary = :blocked_summary,
         state_json = :state_json,
         wait_json = :wait_json,
         cancel_requested_at = :cancel_requested_at,
         created_at = :created_at,
         updated_at = :updated_at,
         ended_at = :ended_at
       WHEN NOT MATCHED THEN INSERT
         (flow_id, sync_mode, shape, owner_key, requester_origin_json,
          controller_id, revision, status, notify_policy, goal,
          current_step, blocked_task_id, blocked_summary,
          state_json, wait_json, cancel_requested_at,
          created_at, updated_at, ended_at)
       VALUES
         (:flow_id, :sync_mode, :shape, :owner_key, :requester_origin_json,
          :controller_id, :revision, :status, :notify_policy, :goal,
          :current_step, :blocked_task_id, :blocked_summary,
          :state_json, :wait_json, :cancel_requested_at,
          :created_at, :updated_at, :ended_at)`,
      row
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

async function pruneFlowsNotInSnapshot(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    const conn = await getConnection();
    try {
      await conn.execute(`DELETE FROM flow_runs`);
      await conn.commit();
    } finally {
      await conn.close();
    }
    return;
  }

  const conn = await getConnection();
  try {
    const placeholders = ids.map(() => '?').join(',');
    await conn.execute(
      `DELETE FROM flow_runs WHERE flow_id NOT IN (${placeholders})`,
      ids
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function loadTaskFlowRegistryState(): Promise<TaskFlowRegistryStoreSnapshot> {
  await ensureSchema();
  const rows = await selectFlowRows();
  return {
    flows: new Map(rows.map((row) => [row.FLOW_ID, rowToFlowRecord(row)])),
  };
}

export async function saveTaskFlowRegistryState(snapshot: TaskFlowRegistryStoreSnapshot): Promise<void> {
  await ensureSchema();
  const flowIds = [...snapshot.flows.keys()];
  if (flowIds.length === 0) {
    const conn = await getConnection();
    try {
      await conn.execute(`DELETE FROM flow_runs`);
      await conn.commit();
    } finally {
      await conn.close();
    }
    return;
  }
  await pruneFlowsNotInSnapshot(flowIds);
  for (const flow of snapshot.flows.values()) {
    await upsertFlowRow(bindFlowRecord(flow));
  }
}

export async function upsertTaskFlowRegistryRecord(flow: TaskFlowRecord): Promise<void> {
  await ensureSchema();
  await upsertFlowRow(bindFlowRecord(flow));
}

export async function deleteTaskFlowRegistryRecord(flowId: string): Promise<void> {
  await ensureSchema();
  const conn = await getConnection();
  try {
    await conn.execute(`DELETE FROM flow_runs WHERE flow_id = :flow_id`, { flow_id: flowId });
    await conn.commit();
  } finally {
    await conn.close();
  }
}