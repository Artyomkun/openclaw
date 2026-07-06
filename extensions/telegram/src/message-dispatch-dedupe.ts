/**
 * Telegram Message Dispatch Dedupe (Oracle)
 */

import oracledb from "oracledb";

const TABLE = "telegram_dispatch_dedupe";

export function createDedupeGuard(pool: oracledb.Pool) {
  return {
    async claim(params: {
      accountId: string;
      chatId: string | number;
      messageId: number;
    }): Promise<{ kind: "claimed" | "duplicate" }> {
      const conn = await pool.getConnection();
      try {
        const id = `${params.accountId}:${params.chatId}:${params.messageId}`;
        try {
          await conn.execute(
            `INSERT INTO ${TABLE} (id, created_at) VALUES (:id, SYSTIMESTAMP)`,
            { id }
          );
          await conn.commit();
          return { kind: "claimed" };
        } catch (error: any) {
          // ORA-00001: unique constraint violated
          if (error.errorNum === 1) {
            return { kind: "duplicate" };
          }
          throw error;
        }
      } finally {
        await conn.close();
      }
    },

    async cleanup(olderThanMs: number = 7 * 24 * 60 * 60 * 1000) {
      const conn = await pool.getConnection();
      try {
        const cutoff = new Date(Date.now() - olderThanMs);
        await conn.execute(
          `DELETE FROM ${TABLE} WHERE created_at < :cutoff`,
          { cutoff }
        );
        await conn.commit();
      } finally {
        await conn.close();
      }
    }
  };
}