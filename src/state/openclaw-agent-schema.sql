-- OpenClaw State Schema — Oracle Edition

-- Schema metadata
BEGIN
  EXECUTE IMMEDIUTE '
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
    IF SQLCODE = -955 THEN NULL; -- ORA-00955: table already exists
    ELSE RAISE;
    END IF;
END;
/

-- Cache entries
BEGIN
  EXECUTE IMMEDIUTE '
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

CREATE INDEX idx_agent_cache_expiry ON cache_entries(scope, expires_at, key);
CREATE INDEX idx_agent_cache_updated ON cache_entries(scope, updated_at DESC);

-- Auth profile store
BEGIN
  EXECUTE IMMEDIUTE '
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

-- Auth profile state
BEGIN
  EXECUTE IMMEDIUTE '
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

-- Memory index meta
BEGIN
  EXECUTE IMMEDIUTE '
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

-- Memory index sources
BEGIN
  EXECUTE IMMEDIUTE '
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

-- Memory index chunks
BEGIN
  EXECUTE IMMEDIUTE '
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

-- Memory embedding cache
BEGIN
  EXECUTE IMMEDIUTE '
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

-- Memory index state (replaces SQLite triggers with sequence)
BEGIN
  EXECUTE IMMEDIUTE '
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

-- Insert initial revision if not exists
MERGE INTO memory_index_state dst
USING (SELECT 1 AS id FROM DUAL) src
  ON (dst.id = src.id)
WHEN NOT MATCHED THEN INSERT (id, revision) VALUES (1, 0);

-- In Oracle, triggers are replaced by application-level revision increments
-- or a sequence + trigger approach. Simpler: increment revision in app code.

-- Indexes
CREATE INDEX idx_memory_embedding_cache_updated_at ON memory_embedding_cache(updated_at);
CREATE INDEX idx_memory_index_sources_source ON memory_index_sources(source);
CREATE INDEX idx_memory_index_chunks_path_source ON memory_index_chunks(path, source);
CREATE INDEX idx_memory_index_chunks_path ON memory_index_chunks(path);
CREATE INDEX idx_memory_index_chunks_source ON memory_index_chunks(source);