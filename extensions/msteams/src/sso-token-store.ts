/**
 * MSTeams - SSO Token Store (Oracle)
 * 
 * Хранилище SSO токенов в Oracle.
 */

import oracledb from "oracledb";
import crypto from "node:crypto";

export type MSTeamsSsoStoredToken = {
  connectionName: string;
  userId: string;
  token: string;
  expiresAt?: string;
  updatedAt: string;
};

export type MSTeamsSsoTokenStore = {
  get(params: { connectionName: string; userId: string }): Promise<MSTeamsSsoStoredToken | null>;
  save(token: MSTeamsSsoStoredToken): Promise<void>;
  remove(params: { connectionName: string; userId: string }): Promise<boolean>;
};

const TABLE = "msteams_sso_tokens";

async function ensureTable(pool: oracledb.Pool): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE TABLE ${TABLE} (
            id VARCHAR2(64) PRIMARY KEY,
            connection_name VARCHAR2(255) NOT NULL,
            user_id VARCHAR2(255) NOT NULL,
            token CLOB NOT NULL,
            expires_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
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
          CREATE INDEX idx_msteams_sso_lookup ON ${TABLE}(connection_name, user_id)
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

function makeKey(connectionName: string, userId: string): string {
  return crypto.createHash("sha256")
    .update(`${connectionName}::${userId}`)
    .digest("hex");
}

export function createMSTeamsSsoTokenStore(pool: oracledb.Pool): MSTeamsSsoTokenStore {
  let initialized = false;

  async function init() {
    if (!initialized) {
      await ensureTable(pool);
      initialized = true;
    }
  }

  return {
    async get({ connectionName, userId }) {
      await init();
      const conn = await pool.getConnection();
      try {
        const result = await conn.execute(
          `SELECT token, expires_at, updated_at FROM ${TABLE}
           WHERE id = :id`,
          { id: makeKey(connectionName, userId) }
        );
        
        if (!result.rows?.length) return null;
        
        const row = result.rows[0];
        return {
          connectionName,
          userId,
          token: row[0],
          expiresAt: row[1]?.toISOString(),
          updatedAt: row[2]?.toISOString() || new Date().toISOString(),
        };
      } finally {
        await conn.close();
      }
    },

    async save(token) {
      await init();
      const conn = await pool.getConnection();
      try {
        await conn.execute(
          `MERGE INTO ${TABLE} target
           USING (SELECT :id AS id FROM DUAL) source
           ON (target.id = source.id)
           WHEN MATCHED THEN
             UPDATE SET 
               token = :token,
               expires_at = TO_TIMESTAMP(:expiresAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),
               updated_at = SYSTIMESTAMP
           WHEN NOT MATCHED THEN
             INSERT (id, connection_name, user_id, token, expires_at)
             VALUES (:id, :connectionName, :userId, :token, 
                     TO_TIMESTAMP(:expiresAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'))`,
          {
            id: makeKey(token.connectionName, token.userId),
            connectionName: token.connectionName,
            userId: token.userId,
            token: token.token,
            expiresAt: token.expiresAt || null,
          }
        );
        await conn.commit();
      } finally {
        await conn.close();
      }
    },

    async remove({ connectionName, userId }) {
      await init();
      const conn = await pool.getConnection();
      try {
        const result = await conn.execute(
          `DELETE FROM ${TABLE} WHERE id = :id`,
          { id: makeKey(connectionName, userId) }
        );
        await conn.commit();
        return (result.rowsAffected || 0) > 0;
      } finally {
        await conn.close();
      }
    },
  };
}