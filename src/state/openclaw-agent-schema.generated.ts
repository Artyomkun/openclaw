/**
 * This file was generated from the Oracle schema source.
 * Please do not edit it manually.
 */

export const OPENCLAW_AGENT_SCHEMA_SQL = `
BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE schema_meta (
      meta_key       VARCHAR2(255) NOT NULL PRIMARY KEY,
      role           VARCHAR2(100) NOT NULL,
      schema_version NUMBER NOT NULL,
      agent_id       VARCHAR2(255),
      app_version    VARCHAR2(100),
      created_at     NUMBER NOT NULL,
      updated_at     NUMBER NOT NULL
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE cache_entries (
      scope       VARCHAR2(255) NOT NULL,
      key         VARCHAR2(255) NOT NULL,
      value_json  CLOB,
      blob        BLOB,
      expires_at  NUMBER,
      updated_at  NUMBER NOT NULL,
      PRIMARY KEY (scope, key)
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

CREATE INDEX idx_agent_cache_expiry ON cache_entries(
  scope,
  CASE WHEN expires_at IS NOT NULL THEN expires_at END,
  key
);
CREATE INDEX idx_agent_cache_updated ON cache_entries(scope, updated_at DESC, key);

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE auth_profile_store (
      store_key   VARCHAR2(255) NOT NULL PRIMARY KEY,
      store_json  CLOB NOT NULL,
      updated_at  NUMBER NOT NULL
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE auth_profile_state (
      state_key   VARCHAR2(255) NOT NULL PRIMARY KEY,
      state_json  CLOB NOT NULL,
      updated_at  NUMBER NOT NULL
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE memory_index_meta (
      key    VARCHAR2(255) PRIMARY KEY,
      value  VARCHAR2(4000) NOT NULL
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE memory_index_sources (
      path    VARCHAR2(4000) NOT NULL,
      source  VARCHAR2(255) DEFAULT ''memory'' NOT NULL,
      hash    VARCHAR2(255) NOT NULL,
      mtime   NUMBER NOT NULL,
      size    NUMBER NOT NULL,
      PRIMARY KEY (path, source)
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE memory_index_chunks (
      id          VARCHAR2(255) PRIMARY KEY,
      path        VARCHAR2(4000) NOT NULL,
      source      VARCHAR2(255) DEFAULT ''memory'' NOT NULL,
      start_line  NUMBER NOT NULL,
      end_line    NUMBER NOT NULL,
      hash        VARCHAR2(255) NOT NULL,
      model       VARCHAR2(255) NOT NULL,
      text        CLOB NOT NULL,
      embedding   CLOB NOT NULL,
      updated_at  NUMBER NOT NULL
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE memory_embedding_cache (
      provider      VARCHAR2(255) NOT NULL,
      model         VARCHAR2(255) NOT NULL,
      provider_key  VARCHAR2(255) NOT NULL,
      hash          VARCHAR2(255) NOT NULL,
      embedding     CLOB NOT NULL,
      dims          NUMBER,
      updated_at    NUMBER NOT NULL,
      PRIMARY KEY (provider, model, provider_key, hash)
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE memory_index_state (
      id        NUMBER PRIMARY KEY CHECK (id = 1),
      revision  NUMBER NOT NULL
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN NULL;
    ELSE RAISE;
    END IF;
END;
/

MERGE INTO memory_index_state dst
USING (SELECT 1 AS id FROM DUAL) src
   ON (dst.id = src.id)
 WHEN NOT MATCHED THEN INSERT (id, revision) VALUES (1, 0);

CREATE OR REPLACE TRIGGER memory_index_sources_revision_after_insert
AFTER INSERT ON memory_index_sources
BEGIN
  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;
END;
/

CREATE OR REPLACE TRIGGER memory_index_sources_revision_after_update
AFTER UPDATE ON memory_index_sources
BEGIN
  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;
END;
/

CREATE OR REPLACE TRIGGER memory_index_sources_revision_after_delete
AFTER DELETE ON memory_index_sources
BEGIN
  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;
END;
/

CREATE OR REPLACE TRIGGER memory_index_chunks_revision_after_insert
AFTER INSERT ON memory_index_chunks
BEGIN
  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;
END;
/

CREATE OR REPLACE TRIGGER memory_index_chunks_revision_after_update
AFTER UPDATE ON memory_index_chunks
BEGIN
  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;
END;
/

CREATE OR REPLACE TRIGGER memory_index_chunks_revision_after_delete
AFTER DELETE ON memory_index_chunks
BEGIN
  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;
END;
/

CREATE INDEX idx_memory_embedding_cache_updated_at ON memory_embedding_cache(updated_at);
CREATE INDEX idx_memory_index_sources_source ON memory_index_sources(source);
CREATE INDEX idx_memory_index_chunks_path_source ON memory_index_chunks(path, source);
CREATE INDEX idx_memory_index_chunks_path ON memory_index_chunks(path);
CREATE INDEX idx_memory_index_chunks_source ON memory_index_chunks(source);
`;