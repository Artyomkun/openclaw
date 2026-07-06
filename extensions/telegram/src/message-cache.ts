/**
 * Telegram Message Cache (Oracle)
 */

import oracledb from "oracledb";

const TABLE = "telegram_messages";

export function createTelegramMessageCache(pool: oracledb.Pool) {
  return {
    async save(params: {
      accountId: string;
      chatId: string;
      messageId: string;
      data: any;
    }) {
      const conn = await pool.getConnection();
      try {
        await conn.execute(
          `MERGE INTO ${TABLE} target
           USING (SELECT :id AS id FROM DUAL) source
           ON (target.id = source.id)
           WHEN MATCHED THEN UPDATE SET data = :data, updated_at = SYSTIMESTAMP
           WHEN NOT MATCHED THEN INSERT (id, account_id, chat_id, data) 
             VALUES (:id, :accountId, :chatId, :data)`,
          {
            id: `${params.accountId}:${params.chatId}:${params.messageId}`,
            accountId: params.accountId,
            chatId: params.chatId,
            data: JSON.stringify(params.data),
          }
        );
        await conn.commit();
      } finally {
        await conn.close();
      }
    },

    async get(params: { accountId: string; chatId: string; messageId: string }) {
      const conn = await pool.getConnection();
      try {
        const result = await conn.execute(
          `SELECT data FROM ${TABLE} WHERE id = :id`,
          { id: `${params.accountId}:${params.chatId}:${params.messageId}` }
        );
        return result.rows?.[0]?.[0] ? JSON.parse(result.rows[0][0]) : null;
      } finally {
        await conn.close();
      }
    },

    async recent(params: { accountId: string; chatId: string; limit: number }) {
      const conn = await pool.getConnection();
      try {
        const result = await conn.execute(
          `SELECT data FROM ${TABLE} 
           WHERE account_id = :accountId AND chat_id = :chatId
           ORDER BY updated_at DESC
           FETCH FIRST :limit ROWS ONLY`,
          { accountId: params.accountId, chatId: params.chatId, limit: params.limit }
        );
        return (result.rows || []).map((row: any[]) => JSON.parse(row[0]));
      } finally {
        await conn.close();
      }
    }
  };
}