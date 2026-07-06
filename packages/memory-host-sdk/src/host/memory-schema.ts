import type { Connection } from "oracledb";
import { formatErrorMessage } from "./error-utils.js";

export const MEMORY_INDEX_META_TABLE = "memory_index_meta";
export const MEMORY_INDEX_SOURCES_TABLE = "memory_index_sources";
export const MEMORY_INDEX_CHUNKS_TABLE = "memory_index_chunks";
export const MEMORY_EMBEDDING_CACHE_TABLE = "memory_embedding_cache";
export const MEMORY_INDEX_STATE_TABLE = "memory_index_state";

const MEMORY_INDEX_SOURCE_COLUMNS = ["path", "source", "hash", "mtime", "size"] as const;

async function tableColumns(
  conn: Connection,
  tableName: string,
): Promise<Set<string>> {
  const result = await conn.execute(
    `SELECT column_name FROM user_tab_columns WHERE table_name = UPPER(:tableName)`,
    [tableName],
  );
  const rows = result.rows as Array<[string]>;
  return new Set(rows.map((row) => row[0].toLowerCase()));
}

async function tableHasExactColumns(
  conn: Connection,
  tableName: string,
  expected: readonly string[],
): Promise<boolean> {
  const columns = await tableColumns(conn, tableName);
  return columns.size === expected.length && expected.every((col) => columns.has(col.toLowerCase()));
}

async function tablePrimaryKeyColumns(
  conn: Connection,
  tableName: string,
): Promise<string[]> {
  const result = await conn.execute(
    `SELECT column_name FROM user_cons_columns
     WHERE constraint_name = (
       SELECT constraint_name FROM user_constraints
       WHERE table_name = UPPER(:tableName) AND constraint_type = 'P'
     )
     ORDER BY position`,
    [tableName],
  );
  const rows = result.rows as Array<[string]>;
  return rows.map((row) => row[0].toLowerCase());
}

async function tableHasPrimaryKey(
  conn: Connection,
  tableName: string,
  expectedColumns: readonly string[],
): Promise<boolean> {
  const columns = await tablePrimaryKeyColumns(conn, tableName);
  return (
    columns.length === expectedColumns.length &&
    columns.every((col, i) => col === expectedColumns[i].toLowerCase())
  );
}

async function migrateCanonicalMemoryIndexSourcesPrimaryKey(
  conn: Connection,
): Promise<void> {
  const hasExactColumns = await tableHasExactColumns(
    conn,
    MEMORY_INDEX_SOURCES_TABLE,
    MEMORY_INDEX_SOURCE_COLUMNS,
  );
  const hasPkPathSource = await tableHasPrimaryKey(conn, MEMORY_INDEX_SOURCES_TABLE, ["path", "source"]);
  const hasPkPath = await tableHasPrimaryKey(conn, MEMORY_INDEX_SOURCES_TABLE, ["path"]);

  if (!hasExactColumns || hasPkPathSource || !hasPkPath) {
    return;
  }

  await conn.execute(`BEGIN
    EXECUTE IMMEDIATE 'DROP TRIGGER memory_index_sources_revision_after_insert';
    EXCEPTION WHEN OTHERS THEN NULL;
  END;`);
  await conn.execute(`BEGIN
    EXECUTE IMMEDIATE 'DROP TRIGGER memory_index_sources_revision_after_update';
    EXCEPTION WHEN OTHERS THEN NULL;
  END;`);
  await conn.execute(`BEGIN
    EXECUTE IMMEDIATE 'DROP TRIGGER memory_index_sources_revision_after_delete';
    EXCEPTION WHEN OTHERS THEN NULL;
  END;`);

  await conn.execute(`BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE ${MEMORY_INDEX_SOURCES_TABLE} RENAME TO memory_index_sources_path_pk_migration';
  END;`);

  await conn.execute(`
    CREATE TABLE ${MEMORY_INDEX_SOURCES_TABLE} (
      path VARCHAR2(1000) NOT NULL,
      source VARCHAR2(255) DEFAULT 'memory' NOT NULL,
      hash VARCHAR2(64) NOT NULL,
      mtime NUMBER(19) NOT NULL,
      size NUMBER(19) NOT NULL,
      CONSTRAINT pk_memory_index_sources PRIMARY KEY (path, source)
    )
  `);

  await conn.execute(`
    INSERT INTO ${MEMORY_INDEX_SOURCES_TABLE} (path, source, hash, mtime, size)
    SELECT path, source, hash, mtime, size
    FROM memory_index_sources_path_pk_migration
  `);

  await conn.execute(`BEGIN
    EXECUTE IMMEDIATE 'DROP TABLE memory_index_sources_path_pk_migration';
  END;`);
}

export async function ensureMemoryIndexSchema(params: {
  conn: Connection;
  embeddingCacheTable?: string;
  cacheEnabled: boolean;
  ftsEnabled: boolean;
  ftsTokenizer?: "unicode61" | "trigram";
}): Promise<{ ftsAvailable: boolean; ftsError?: string }> {
  const embeddingCacheTable = params.embeddingCacheTable ?? MEMORY_EMBEDDING_CACHE_TABLE;
  const { conn } = params;

  // Создаём таблицы с проверкой существования
  const createTable = async (name: string, oracle: string) => {
    try {
      await conn.execute(oracle);
      await conn.execute(`DROP TRIGGER ${name}`);
    } catch (err: any) {
      if (err.errorNum !== 955) throw err; // ORA-00955: name already used
    }
  };

  await createTable(`
    CREATE TABLE ${MEMORY_INDEX_META_TABLE} (
      key VARCHAR2(255) PRIMARY KEY,
      value CLOB NOT NULL
    )
  `);

  await createTable(`
    CREATE TABLE ${MEMORY_INDEX_SOURCES_TABLE} (
      path VARCHAR2(1000) NOT NULL,
      source VARCHAR2(255) DEFAULT 'memory' NOT NULL,
      hash VARCHAR2(64) NOT NULL,
      mtime NUMBER(19) NOT NULL,
      size NUMBER(19) NOT NULL,
      CONSTRAINT pk_memory_index_sources PRIMARY KEY (path, source)
    )
  `);

  await createTable(`
    CREATE TABLE ${MEMORY_INDEX_CHUNKS_TABLE} (
      id VARCHAR2(64) PRIMARY KEY,
      path VARCHAR2(1000) NOT NULL,
      source VARCHAR2(255) DEFAULT 'memory' NOT NULL,
      start_line NUMBER(19) NOT NULL,
      end_line NUMBER(19) NOT NULL,
      hash VARCHAR2(64) NOT NULL,
      model VARCHAR2(255) NOT NULL,
      text CLOB NOT NULL,
      embedding CLOB NOT NULL,
      updated_at NUMBER(19) NOT NULL
    )
  `);

  await createTable(`
    CREATE TABLE ${MEMORY_INDEX_STATE_TABLE} (
      id NUMBER(1) PRIMARY KEY CHECK (id = 1),
      revision NUMBER(19) NOT NULL
    )
  `);

  await conn.execute(`
    INSERT INTO ${MEMORY_INDEX_STATE_TABLE} (id, revision)
    SELECT 1, 0 FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ${MEMORY_INDEX_STATE_TABLE} WHERE id = 1)
  `);

  await migrateCanonicalMemoryIndexSourcesPrimaryKey(conn);

  // Создание триггеров
  const createTrigger = async (name: string, sql: string) => {
    try {
      // Сначала удаляем старый триггер (если есть)
      await conn.execute(`DROP TRIGGER ${name}`);
    } catch (err: any) {
      // ORA-04080: trigger does not exist — пропускаем
      if (err.errorNum !== 4080) {
        throw err;
      }
    }

    // Теперь создаём новый
    try {
      await conn.execute(sql);
    } catch (err: any) {
      // ORA-00955: name already used — триггер уже существует
      if (err.errorNum === 955) {
        return;
      }
      throw err;
    }
  };

  await createTrigger(
    "memory_index_sources_revision_after_insert",
    `
    CREATE OR REPLACE TRIGGER memory_index_sources_revision_after_insert
    AFTER INSERT ON ${MEMORY_INDEX_SOURCES_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    `
  );

  await createTrigger(
    "memory_index_sources_revision_after_update",
    `
    CREATE OR REPLACE TRIGGER memory_index_sources_revision_after_update
    AFTER UPDATE ON ${MEMORY_INDEX_SOURCES_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    `
  );

  await createTrigger(
    "memory_index_sources_revision_after_delete",
    `
    CREATE OR REPLACE TRIGGER memory_index_sources_revision_after_delete
    AFTER DELETE ON ${MEMORY_INDEX_SOURCES_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    `
  );

  await createTrigger(
    "memory_index_chunks_revision_after_insert",
    `
    CREATE OR REPLACE TRIGGER memory_index_chunks_revision_after_insert
    AFTER INSERT ON ${MEMORY_INDEX_CHUNKS_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    `
  );

  await createTrigger(
    "memory_index_chunks_revision_after_update",
    `
    CREATE OR REPLACE TRIGGER memory_index_chunks_revision_after_update
    AFTER UPDATE ON ${MEMORY_INDEX_CHUNKS_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    `
  );

  await createTrigger(
    "memory_index_chunks_revision_after_delete",
    `
    CREATE OR REPLACE TRIGGER memory_index_chunks_revision_after_delete
    AFTER DELETE ON ${MEMORY_INDEX_CHUNKS_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    `
  );

  // Индексы
  const createIndex = async (oracle: string) => {
    try {
      await conn.execute(oracle);
    } catch (err: any) {
      // ORA-00955: name already used by an existing object
      if (err.errorNum === 955) {
        return;
      }
      throw err;
    }
  };

  await createIndex(
    "idx_memory_index_sources_source",
    `CREATE INDEX idx_memory_index_sources_source ON ${MEMORY_INDEX_SOURCES_TABLE}(source)`
  );

  await createIndex(
    "idx_memory_index_chunks_path_source",
    `CREATE INDEX idx_memory_index_chunks_path_source ON ${MEMORY_INDEX_CHUNKS_TABLE}(path, source)`
  );

  await createIndex(
    "idx_memory_index_chunks_path",
    `CREATE INDEX idx_memory_index_chunks_path ON ${MEMORY_INDEX_CHUNKS_TABLE}(path)`
  );

  await createIndex(
    "idx_memory_index_chunks_source",
    `CREATE INDEX idx_memory_index_chunks_source ON ${MEMORY_INDEX_CHUNKS_TABLE}(source)`
  );

  if (params.cacheEnabled) {
    await createTable(`
      CREATE TABLE ${embeddingCacheTable} (
        provider VARCHAR2(255) NOT NULL,
        model VARCHAR2(255) NOT NULL,
        provider_key VARCHAR2(255) NOT NULL,
        hash VARCHAR2(64) NOT NULL,
        embedding CLOB NOT NULL,
        dims NUMBER,
        updated_at NUMBER(19) NOT NULL,
        CONSTRAINT pk_embedding_cache PRIMARY KEY (provider, model, provider_key, hash)
      )
    `);

    await createIndex(
      "idx_embedding_cache_updated_at",
      `CREATE INDEX idx_embedding_cache_updated_at ON ${embeddingCacheTable}(updated_at)`
    );
  }

  let ftsAvailable = false;
  let ftsError: string | undefined;
  if (params.ftsEnabled) {
    try {
      await conn.execute(`
        CREATE INDEX memory_index_chunks_ctx ON ${MEMORY_INDEX_CHUNKS_TABLE}(text)
        INDEXTYPE IS CTXSYS.CONTEXT
      `);
      ftsAvailable = true;
    } catch (err) {
      const message = formatErrorMessage(err);
      ftsAvailable = false;
      ftsError = message;
    }
  }

  return { ftsAvailable, ...(ftsError ? { ftsError } : {}) };
}