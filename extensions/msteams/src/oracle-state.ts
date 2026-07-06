/**
 * MSTeams - Oracle State
 * 
 * Хранилище состояния MSTeams на Oracle.
 * БЕЗ SQLITE!
 */

import oracledb from "oracledb";
import crypto from "node:crypto";

export type MSTeamsStateOptions = {
  pool: oracledb.Pool;
  tableName?: string;
};

type StoredConversationReference = {
  conversation: { id: string };
  user?: { id?: string; aadObjectId?: string };
  lastSeenAt: string;
};

const DEFAULT_TABLE = "msteams_conversations";

async function ensureTable(pool: oracledb.Pool, tableName: string): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE TABLE ${tableName} (
            id VARCHAR2(64) PRIMARY KEY,
            conversation_id VARCHAR2(255) NOT NULL,
            reference CLOB NOT NULL,
            user_id VARCHAR2(255),
            aad_object_id VARCHAR2(255),
            last_seen_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP
          )
        ';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE INDEX idx_msteams_conv_user_id ON ${tableName}(user_id)
        ';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE INDEX idx_msteams_conv_aad_id ON ${tableName}(aad_object_id)
        ';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.commit();
  } finally {
    await conn.close();
  }
}

function hashKey(conversationId: string): string {
  return crypto.createHash("sha256").update(conversationId).digest("hex");
}

export function createMSTeamsStateStore(options: MSTeamsStateOptions) {
  const pool = options.pool;
  const tableName = options.tableName || DEFAULT_TABLE;
  let initialized = false;

  async function init() {
    if (!initialized) {
      await ensureTable(pool, tableName);
      initialized = true;
    }
  }

  return {
    get: async (conversationId: string): Promise<StoredConversationReference | null> => {
      await init();
      const conn = await pool.getConnection();
      try {
        const result = await conn.execute(
          `SELECT reference FROM ${tableName} WHERE id = :id`,
          { id: hashKey(conversationId) }
        );
        if (!result.rows || result.rows.length === 0) {
          return null;
        }
        return JSON.parse(result.rows[0][0] as string);
      } finally {
        await conn.close();
      }
    },
    upsert: async (conversationId: string, reference: StoredConversationReference): Promise<void> => {
      await init();
      const conn = await pool.getConnection();
      try {
        const id = hashKey(conversationId);
        const userId = reference.user?.id || null;
        const aadObjectId = reference.user?.aadObjectId || null;
        const lastSeenAt = reference.lastSeenAt || new Date().toISOString();

        await conn.execute(
          `MERGE INTO ${tableName} target
           USING (SELECT :id AS id FROM DUAL) source
           ON (target.id = source.id)
           WHEN MATCHED THEN
             UPDATE SET 
               reference = :reference,
               user_id = :userId,
               aad_object_id = :aadObjectId,
               last_seen_at = TO_TIMESTAMP(:lastSeenAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')
           WHEN NOT MATCHED THEN
             INSERT (id, conversation_id, reference, user_id, aad_object_id, last_seen_at)
             VALUES (:id, :conversationId, :reference, :userId, :aadObjectId, 
                     TO_TIMESTAMP(:lastSeenAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'))`,
          {
            id,
            conversationId,
            reference: JSON.stringify(reference),
            userId,
            aadObjectId,
            lastSeenAt,
          }
        );
        await conn.commit();
      } finally {
        await conn.close();
      }
    },
    remove: async (conversationId: string): Promise<boolean> => {
      await init();
      const conn = await pool.getConnection();
      try {
        const result = await conn.execute(
          `DELETE FROM ${tableName} WHERE id = :id`,
          { id: hashKey(conversationId) }
        );
        await conn.commit();
        return (result.rowsAffected || 0) > 0;
      } finally {
        await conn.close();
      }
    },
    list: async (): Promise<Array<{ conversationId: string; reference: StoredConversationReference }>> => {
      await init();
      const conn = await pool.getConnection();
      try {
        const result = await conn.execute(
          `SELECT conversation_id, reference FROM ${tableName}`
        );
        return (result.rows || []).map((row: any[]) => ({
          conversationId: row[0],
          reference: JSON.parse(row[1] as string),
        }));
      } finally {
        await conn.close();
      }
    },
    findPreferredDmByUserId: async (userId: string): Promise<{ conversationId: string; reference: StoredConversationReference } | null> => {
      await init();
      const conn = await pool.getConnection();
      try {
        const result = await conn.execute(
          `SELECT conversation_id, reference, last_seen_at 
           FROM ${tableName} 
           WHERE user_id = :userId OR aad_object_id = :userId
           ORDER BY last_seen_at DESC
           FETCH FIRST 1 ROW ONLY`,
          { userId }
        );
        if (!result.rows || result.rows.length === 0) {
          return null;
        }
        return {
          conversationId: result.rows[0][0] as string,
          reference: JSON.parse(result.rows[0][1] as string),
        };
      } finally {
        await conn.close();
      }
    },
    cleanup: async (ttlMs: number): Promise<number> => {
      await init();
      const conn = await pool.getConnection();
      try {
        const cutoff = new Date(Date.now() - ttlMs);
        const result = await conn.execute(
          `DELETE FROM ${tableName} 
           WHERE last_seen_at < TO_TIMESTAMP(:cutoff, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')`,
          { cutoff: cutoff.toISOString() }
        );
        await conn.commit();
        return result.rowsAffected || 0;
      } finally {
        await conn.close();
      }
    },
  };
}