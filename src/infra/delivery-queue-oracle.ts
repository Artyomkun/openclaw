// Stores durable delivery queue entries in Oracle.
import { requireNodeOracle } from "../infra/node-oracle.ts";

type QueueStatus = "pending" | "failed";

/** Indexed metadata extracted from queue payloads for diagnostics and recovery. */
export type DeliveryQueueRowMetadata = {
  entryKind?: string;
  sessionKey?: string;
  channel?: string;
  target?: string;
  accountId?: string;
};

/** Persisted queue entry fields common to all delivery queue payloads. */
export type DeliveryQueueEntryState = {
  id: string;
  enqueuedAt: number;
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
  platformSendStartedAt?: number;
  recoveryState?: string;
};

type QueueRow = {
  ID: string;
  ENTRY_JSON: string;
  ENQUEUED_AT: number;
  RETRY_COUNT: number;
  LAST_ATTEMPT_AT: number | null;
  LAST_ERROR: string | null;
  PLATFORM_SEND_STARTED_AT: number | null;
  RECOVERY_STATE: string | null;
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
        EXECUTE IMMEDIATE 'CREATE TABLE delivery_queue_entries (
          queue_name VARCHAR2(128) NOT NULL,
          id VARCHAR2(128) NOT NULL,
          status VARCHAR2(16) NOT NULL,
          entry_kind VARCHAR2(64),
          session_key VARCHAR2(128),
          channel VARCHAR2(64),
          target VARCHAR2(256),
          account_id VARCHAR2(128),
          retry_count NUMBER NOT NULL,
          last_attempt_at NUMBER,
          last_error CLOB,
          recovery_state CLOB,
          platform_send_started_at NUMBER,
          entry_json CLOB NOT NULL,
          enqueued_at NUMBER NOT NULL,
          updated_at NUMBER NOT NULL,
          failed_at NUMBER,
          PRIMARY KEY (queue_name, id)
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_delivery_queue_status ON delivery_queue_entries(queue_name, status)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_delivery_queue_enqueued ON delivery_queue_entries(queue_name, enqueued_at)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.commit();
  } finally {
    await conn.close();
  }
}

function enoent(queueName: string, id: string): Error & { code: string } {
  const err = new Error(`No pending ${queueName} delivery queue entry ${id}`) as Error & {
    code: string;
  };
  err.code = "ENOENT";
  return err;
}

function inflate(row: QueueRow): DeliveryQueueEntryState {
  return {
    ...(JSON.parse(row.ENTRY_JSON) as DeliveryQueueEntryState),
    id: row.ID,
    enqueuedAt: Number(row.ENQUEUED_AT),
    retryCount: Number(row.RETRY_COUNT),
    ...(row.LAST_ATTEMPT_AT == null ? {} : { lastAttemptAt: Number(row.LAST_ATTEMPT_AT) }),
    ...(row.LAST_ERROR == null ? {} : { lastError: row.LAST_ERROR }),
    ...(row.PLATFORM_SEND_STARTED_AT == null
      ? {}
      : { platformSendStartedAt: Number(row.PLATFORM_SEND_STARTED_AT) }),
    ...(row.RECOVERY_STATE == null ? {} : { recoveryState: row.RECOVERY_STATE }),
  };
}

function metadata(entry: DeliveryQueueEntryState): DeliveryQueueRowMetadata {
  const item = entry as DeliveryQueueEntryState & {
    kind?: string;
    sessionKey?: string;
    channel?: string;
    to?: string;
    accountId?: string;
    session?: { key?: string };
    route?: { channel?: string; to?: string; accountId?: string };
    deliveryContext?: { channel?: string; to?: string; accountId?: string };
  };
  return {
    entryKind: item.kind,
    sessionKey: item.sessionKey ?? item.session?.key,
    channel: item.channel ?? item.route?.channel ?? item.deliveryContext?.channel,
    target: item.to ?? item.route?.to ?? item.deliveryContext?.to,
    accountId: item.accountId ?? item.route?.accountId ?? item.deliveryContext?.accountId,
  };
}

/** Insert or replace a delivery queue entry under a queue namespace. */
export async function upsertDeliveryQueueEntry(params: {
  queueName: string;
  entry: DeliveryQueueEntryState;
  metadata?: DeliveryQueueRowMetadata;
  status?: QueueStatus;
}): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  const status = params.status ?? "pending";
  const meta = params.metadata ?? metadata(params.entry);
  const conn = await getConnection();
  try {
    await conn.execute(
      `MERGE INTO delivery_queue_entries t
       USING (SELECT :queue_name AS queue_name, :id AS id FROM DUAL) s
       ON (t.queue_name = s.queue_name AND t.id = s.id)
       WHEN MATCHED THEN UPDATE SET
         status = :status,
         entry_kind = :entry_kind,
         session_key = :session_key,
         channel = :channel,
         target = :target,
         account_id = :account_id,
         retry_count = :retry_count,
         last_attempt_at = :last_attempt_at,
         last_error = :last_error,
         recovery_state = :recovery_state,
         platform_send_started_at = :platform_send_started_at,
         entry_json = :entry_json,
         enqueued_at = :enqueued_at,
         updated_at = :updated_at,
         failed_at = :failed_at
       WHEN NOT MATCHED THEN INSERT
         (queue_name, id, status, entry_kind, session_key, channel, target,
          account_id, retry_count, last_attempt_at, last_error, recovery_state,
          platform_send_started_at, entry_json, enqueued_at, updated_at, failed_at)
       VALUES
         (:queue_name, :id, :status, :entry_kind, :session_key, :channel, :target,
          :account_id, :retry_count, :last_attempt_at, :last_error, :recovery_state,
          :platform_send_started_at, :entry_json, :enqueued_at, :updated_at, :failed_at)`,
      {
        queue_name: params.queueName,
        id: params.entry.id,
        status,
        entry_kind: meta.entryKind ?? null,
        session_key: meta.sessionKey ?? null,
        channel: meta.channel ?? null,
        target: meta.target ?? null,
        account_id: meta.accountId ?? null,
        retry_count: params.entry.retryCount,
        last_attempt_at: params.entry.lastAttemptAt ?? null,
        last_error: params.entry.lastError ?? null,
        recovery_state: params.entry.recoveryState ?? null,
        platform_send_started_at: params.entry.platformSendStartedAt ?? null,
        entry_json: JSON.stringify(params.entry),
        enqueued_at: params.entry.enqueuedAt,
        updated_at: now,
        failed_at: status === "failed" ? now : null,
      }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

/** Load a single pending delivery queue entry. */
export async function loadDeliveryQueueEntry(
  queueName: string,
  id: string,
): Promise<DeliveryQueueEntryState | null> {
  await ensureSchema();
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT id, entry_json, enqueued_at, retry_count, last_attempt_at, last_error,
              platform_send_started_at, recovery_state
       FROM delivery_queue_entries
       WHERE queue_name = :queue_name
         AND id = :id
         AND status = 'pending'`,
      { queue_name: queueName, id }
    );
    if (result.rows.length === 0) return null;
    return inflate(result.rows[0] as QueueRow);
  } finally {
    await conn.close();
  }
}

/** Load all pending entries for a queue namespace in database order. */
export async function loadDeliveryQueueEntries(
  queueName: string,
): Promise<DeliveryQueueEntryState[]> {
  await ensureSchema();
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT id, entry_json, enqueued_at, retry_count, last_attempt_at, last_error,
              platform_send_started_at, recovery_state
       FROM delivery_queue_entries
       WHERE queue_name = :queue_name
         AND status = 'pending'
       ORDER BY enqueued_at ASC, id ASC`,
      { queue_name: queueName }
    );
    return (result.rows as QueueRow[]).map(inflate);
  } finally {
    await conn.close();
  }
}

/** Delete a pending delivery queue entry after successful delivery. */
export async function deleteDeliveryQueueEntry(queueName: string, id: string): Promise<void> {
  await ensureSchema();
  const conn = await getConnection();
  try {
    await conn.execute(
      `DELETE FROM delivery_queue_entries
       WHERE queue_name = :queue_name
         AND id = :id
         AND status = 'pending'`,
      { queue_name: queueName, id }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

/** Load, transform, and persist a pending delivery queue entry. */
export async function updateDeliveryQueueEntry(
  queueName: string,
  id: string,
  update: (entry: DeliveryQueueEntryState) => DeliveryQueueEntryState,
): Promise<void> {
  const current = await loadDeliveryQueueEntry(queueName, id);
  if (!current) {
    throw enoent(queueName, id);
  }
  await upsertDeliveryQueueEntry({ queueName, entry: update(current) });
}

/** Mark a pending delivery queue entry as failed for later diagnostics. */
export async function moveDeliveryQueueEntryToFailed(queueName: string, id: string): Promise<void> {
  const current = await loadDeliveryQueueEntry(queueName, id);
  if (!current) {
    throw enoent(queueName, id);
  }
  await upsertDeliveryQueueEntry({ queueName, entry: current, status: "failed" });
}