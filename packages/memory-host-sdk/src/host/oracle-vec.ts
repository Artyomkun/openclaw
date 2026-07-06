/**
 * Memory Host - Oracle Vector Search
 */

import oracledb from "oracledb";

export async function checkOracleVectorSearch(pool: oracledb.Pool): Promise<{
  ok: boolean;
  error?: string;
  version?: string;
}> {
  const conn = await pool.getConnection();
  try {
    const result = await conn.execute(`
      SELECT 1 FROM v$version WHERE banner LIKE '%AI Vector Search%' OR banner LIKE '%23ai%'
    `);
    
    if (result.rows && result.rows.length > 0) {
      return { ok: true, version: "Oracle AI Vector Search available" };
    }
    const versionResult = await conn.execute(`
      SELECT banner FROM v$version WHERE rownum = 1
    `);
    
    const version = versionResult.rows?.[0]?.[0] as string || "Unknown";
    return { 
      ok: false, 
      error: `Oracle AI Vector Search not available. Current version: ${version}. Requires Oracle 23ai+` 
    };
  } catch (error) {
    return { 
      ok: false, 
      error: `Failed to check Oracle AI Vector Search: ${error instanceof Error ? error.message : String(error)}` 
    };
  } finally {
    await conn.close();
  }
}

export async function createVectorTable(pool: oracledb.Pool, tableName: string): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE TABLE ${tableName} (
            id VARCHAR2(64) PRIMARY KEY,
            embedding VECTOR,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP
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

export async function saveVector(params: {
  pool: oracledb.Pool;
  tableName: string;
  id: string;
  embedding: number[];
}): Promise<void> {
  const conn = await params.pool.getConnection();
  try {
    const vectorStr = `[${params.embedding.join(',')}]`;
    await conn.execute(
      `MERGE INTO ${params.tableName} target
       USING (SELECT :id AS id FROM DUAL) source
       ON (target.id = source.id)
       WHEN MATCHED THEN UPDATE SET embedding = TO_VECTOR(:vector)
       WHEN NOT MATCHED THEN INSERT (id, embedding) VALUES (:id, TO_VECTOR(:vector))`,
      {
        id: params.id,
        vector: vectorStr,
      }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function searchVectors(params: {
  pool: oracledb.Pool;
  tableName: string;
  queryVector: number[];
  limit?: number;
}): Promise<Array<{ id: string; score: number }>> {
  const conn = await params.pool.getConnection();
  try {
    const vectorStr = `[${params.queryVector.join(',')}]`;
    const result = await conn.execute(
      `SELECT id, 1 - VECTOR_DISTANCE(embedding, TO_VECTOR(:vector), COSINE) AS score
       FROM ${params.tableName}
       ORDER BY score DESC
       FETCH FIRST :limit ROWS ONLY`,
      {
        vector: vectorStr,
        limit: params.limit || 10,
      }
    );
    return (result.rows || []).map((row: any[]) => ({
      id: row[0],
      score: row[1] || 0,
    }));
  } finally {
    await conn.close();
  }
}