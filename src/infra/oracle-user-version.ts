import oracledb from 'oracledb';

export async function readOracleSchemaVersion(
  connection: oracledb.Connection
): Promise<number> {
  try {
    const result = await connection.execute<{ VERSION: number }>(
      `
      SELECT version
      FROM schema_metadata
      WHERE ROWNUM = 1
      `
    );
    
    return result.rows?.[0]?.VERSION ?? 0;
  } catch {
    return 0;
  }
}

export async function writeOracleSchemaVersion(
  connection: oracledb.Connection,
  version: number
): Promise<void> {
  await connection.execute(`
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE schema_metadata (
          key VARCHAR2(100) PRIMARY KEY,
          version NUMBER,
          updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
        )
      ';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF; -- ORA-00955: table already exists
    END;
  `);
  await connection.execute(
    `
    MERGE INTO schema_metadata t
    USING (SELECT 'schema_version' AS key FROM DUAL) s
    ON (t.key = s.key)
    WHEN MATCHED THEN UPDATE SET
      version = :version,
      updated_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (key, version, updated_at)
    VALUES ('schema_version', :version, SYSTIMESTAMP)
    `,
    { version }
  );
}

export const readOracleUserVersion = readOracleSchemaVersion;
export const writeOracleUserVersion = writeOracleSchemaVersion;