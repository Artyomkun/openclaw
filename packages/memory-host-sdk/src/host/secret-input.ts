/**
 * Memory Host - Oracle Secrets
 */

import oracledb from "oracledb";

const TABLE = "secrets";

async function ensureTable(pool: oracledb.Pool): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE TABLE ${TABLE} (
            id VARCHAR2(255) PRIMARY KEY,
            value CLOB NOT NULL,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
          )
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

export async function getSecret(params: {
  pool: oracledb.Pool;
  id: string;
}): Promise<string | undefined> {
  await ensureTable(params.pool);
  const conn = await params.pool.getConnection();
  try {
    const result = await conn.execute(
      `SELECT value FROM ${TABLE} WHERE id = :id`,
      { id: params.id }
    );
    return result.rows?.[0]?.[0] as string | undefined;
  } finally {
    await conn.close();
  }
}

export async function setSecret(params: {
  pool: oracledb.Pool;
  id: string;
  value: string;
}): Promise<void> {
  await ensureTable(params.pool);
  const conn = await params.pool.getConnection();
  try {
    await conn.execute(
      `MERGE INTO ${TABLE} target
       USING (SELECT :id AS id FROM DUAL) source
       ON (target.id = source.id)
       WHEN MATCHED THEN UPDATE SET value = :value, updated_at = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (id, value) VALUES (:id, :value)`,
      {
        id: params.id,
        value: params.value,
      }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function deleteSecret(params: {
  pool: oracledb.Pool;
  id: string;
}): Promise<void> {
  await ensureTable(params.pool);
  const conn = await params.pool.getConnection();
  try {
    await conn.execute(
      `DELETE FROM ${TABLE} WHERE id = :id`,
      { id: params.id }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export function hasSecret(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveSecret(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}