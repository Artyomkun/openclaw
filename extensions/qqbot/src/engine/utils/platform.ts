/**
 * QQ Bot - Oracle Platform Helpers
 */

import oracledb from "oracledb";

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function getTempDir(): string {
  return process.env.TEMP || process.env.TMP || "/tmp";
}

let silkWasmAvailable: boolean | null = null;

export async function checkSilkWasmAvailable(): Promise<boolean> {
  if (silkWasmAvailable !== null) return silkWasmAvailable;
  try {
    const { isSilk } = await import("silk-wasm");
    isSilk(new Uint8Array(0));
    silkWasmAvailable = true;
  } catch {
    silkWasmAvailable = false;
  }
  return silkWasmAvailable;
}

const TABLE = "qqbot_media";

export async function saveMedia(params: {
  pool: oracledb.Pool;
  id: string;
  data: Buffer;
  mimeType: string;
  filename: string;
}) {
  const conn = await params.pool.getConnection();
  try {
    await conn.execute(
      `MERGE INTO ${TABLE} target
       USING (SELECT :id AS id FROM DUAL) source
       ON (target.id = source.id)
       WHEN MATCHED THEN 
         UPDATE SET data = :data, mime_type = :mimeType, filename = :filename, updated_at = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (id, data, mime_type, filename) VALUES (:id, :data, :mimeType, :filename)`,
      {
        id: params.id,
        data: params.data,
        mimeType: params.mimeType,
        filename: params.filename,
      }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function getMedia(params: {
  pool: oracledb.Pool;
  id: string;
}) {
  const conn = await params.pool.getConnection();
  try {
    const result = await conn.execute(
      `SELECT data, mime_type, filename FROM ${TABLE} WHERE id = :id`,
      { id: params.id }
    );
    if (!result.rows?.length) return null;
    const row = result.rows[0];
    return { data: row[0], mimeType: row[1], filename: row[2] };
  } finally {
    await conn.close();
  }
}