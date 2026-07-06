import oracledb from "oracledb";
import { resolveAgentDir } from "openclaw/plugin-sdk/agent-runtime";
import {
  resolveConfiguredSourcesForMeta,
  resolveConfiguredScopeHash,
} from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import { EventEmitter } from "events";

type MemoryIndexEntry = {
  path: string;
  absPath: string;
  mtimeMs: number;
  size: number;
  hash: string;
  content?: string;
};

type MemorySource = "memory" | "sessions";

type ChunkingConfig = {
  tokens: number;
  overlap: number;
  strategy: "fixed" | "semantic" | "paragraph";
};

type FTSSettings = {
  tokenizer: "standard" | "simple" | "custom";
  language?: string;
  stopwords?: string[];
};

type StoreSettings = {
  fts: FTSSettings;
  embedding?: {
    enabled: boolean;
    dimension: number;
    provider: string;
    model: string;
  };
};

type MemorySettings = {
  extraPaths?: string[];
  multimodal?: boolean;
  chunking: ChunkingConfig;
  store: StoreSettings;
  syncInterval?: number;
  watchDebounce?: number;
  sessionWatchDebounce?: number;
  maxConcurrentOperations?: number;
};

type SessionEvent = {
  type: "create" | "update" | "delete";
  path: string;
  sessionId: string;
  data?: any;
};

export class MemoryManagerAsyncOps extends EventEmitter {
  private pool: oracledb.Pool;
  private settings: MemorySettings;
  private agentId: string;
  private workspaceDir: string;
  private provider?: { id: string; model: string };
  private providerKey?: string;
  private sources: Set<MemorySource>;
  private dirty: boolean = false;
  private sessionsDirty: boolean = false;
  private dirtyFiles: Set<string> = new Set();
  private sessionsDirtyFiles: Set<string> = new Set();
  private closed: boolean = false;
  private watcher: any = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private watchTimer: NodeJS.Timeout | null = null;
  private sessionWatchTimer: NodeJS.Timeout | null = null;
  private sessionUnsubscribe: (() => void) | null = null;
  private sessionListeners: Map<string, Set<(event: SessionEvent) => void>> = new Map();
  private isSyncing: boolean = false;
  private syncQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;
  private semaphore: number = 0;
  private maxConcurrent: number = 10;

  constructor(
    pool: oracledb.Pool,
    settings: MemorySettings,
    agentId: string,
    workspaceDir: string,
    provider?: { id: string; model: string },
    providerKey?: string,
    sources: Set<MemorySource> = new Set(["memory"])
  ) {
    super();
    this.pool = pool;
    this.settings = settings;
    this.agentId = agentId;
    this.workspaceDir = workspaceDir;
    this.provider = provider;
    this.providerKey = providerKey;
    this.sources = sources;
    this.maxConcurrent = settings.maxConcurrentOperations || 10;
  }

  protected getPool(): oracledb.Pool {
    return this.pool;
  }

  protected async withConnectionAsync<T>(
    fn: (conn: oracledb.Connection) => Promise<T>
  ): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      await conn.close();
    }
  }

  protected async withTransactionAsync<T>(
    fn: (conn: oracledb.Connection) => Promise<T>
  ): Promise<T> {
    return this.withConnectionAsync(async (conn) => {
      await conn.execute('BEGIN TRANSACTION');
      try {
        const result = await fn(conn);
        await conn.execute('COMMIT');
        return result;
      } catch (error) {
        await conn.execute('ROLLBACK');
        throw error;
      }
    });
  }

  protected async withSemaphoreAsync<T>(fn: () => Promise<T>): Promise<T> {
    while (this.semaphore >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.semaphore++;
    try {
      return await fn();
    } finally {
      this.semaphore--;
    }
  }

  private async ensureTablesAsync(): Promise<void> {
    await this.withConnectionAsync(async (conn) => {
      // Create memory_index_meta table
      try {
        await conn.execute(`BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE memory_index_meta (
              key VARCHAR2(255) PRIMARY KEY,
              value CLOB NOT NULL
            )
          ';
          EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;`);
      } catch (error) {
        if (error.errorNum !== 955) throw error;
      }

      // Create memory_index_sources table
      try {
        await conn.execute(`BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE memory_index_sources (
              path VARCHAR2(1000) NOT NULL,
              source VARCHAR2(255) NOT NULL,
              hash VARCHAR2(64) NOT NULL,
              mtime NUMBER(19) NOT NULL,
              size NUMBER(19) NOT NULL,
              PRIMARY KEY (path, source)
            )
          ';
          EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;`);
      } catch (error) {
        if (error.errorNum !== 955) throw error;
      }

      // Create memory_index_chunks table
      try {
        await conn.execute(`BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE memory_index_chunks (
              id VARCHAR2(64) PRIMARY KEY,
              path VARCHAR2(1000) NOT NULL,
              source VARCHAR2(255) NOT NULL,
              start_line NUMBER(19) NOT NULL,
              end_line NUMBER(19) NOT NULL,
              hash VARCHAR2(64) NOT NULL,
              model VARCHAR2(255) NOT NULL,
              text CLOB NOT NULL,
              embedding CLOB,
              updated_at NUMBER(19) NOT NULL
            )
          ';
          EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;`);
      } catch (error) {
        if (error.errorNum !== 955) throw error;
      }

      // Create memory_dirty_files table
      try {
        await conn.execute(`BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE memory_dirty_files (
              path VARCHAR2(1000) NOT NULL,
              source VARCHAR2(255) NOT NULL,
              dirty_at NUMBER(19) NOT NULL,
              PRIMARY KEY (path, source)
            )
          ';
          EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;`);
      } catch (error) {
        if (error.errorNum !== 955) throw error;
      }

      // Create memory_session_events table
      try {
        await conn.execute(`BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE memory_session_events (
              id VARCHAR2(64) PRIMARY KEY,
              session_id VARCHAR2(255) NOT NULL,
              path VARCHAR2(1000) NOT NULL,
              event_type VARCHAR2(50) NOT NULL,
              event_data CLOB,
              timestamp NUMBER(19) NOT NULL
            )
          ';
          EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;`);
      } catch (error) {
        if (error.errorNum !== 955) throw error;
      }

      // Create indexes
      const indexes = [
        'CREATE INDEX idx_memory_index_sources_source ON memory_index_sources(source)',
        'CREATE INDEX idx_memory_index_chunks_path_source ON memory_index_chunks(path, source)',
        'CREATE INDEX idx_memory_dirty_files_source ON memory_dirty_files(source)',
        'CREATE INDEX idx_memory_session_events_session ON memory_session_events(session_id)'
      ];

      for (const indexSql of indexes) {
        try {
          await conn.execute(`BEGIN
            EXECUTE IMMEDIATE '${indexSql}';
            EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
          END;`);
        } catch (error) {
          if (error.errorNum !== 955) throw error;
        }
      }
    });
  }

  private async readMetaAsync(): Promise<any | null> {
    return this.withConnectionAsync(async (conn) => {
      const result = await conn.execute(
        `SELECT value FROM memory_index_meta WHERE key = 'memory_index_meta_v1'`
      );
      if (result.rows.length === 0) return null;
      return JSON.parse(result.rows[0][0]);
    });
  }

  private async writeMetaAsync(meta: any): Promise<void> {
    await this.withConnectionAsync(async (conn) => {
      await conn.execute(
        `MERGE INTO memory_index_meta m
         USING (SELECT 'memory_index_meta_v1' AS key, :value AS val FROM DUAL) src
         ON (m.key = src.key)
         WHEN MATCHED THEN UPDATE SET m.value = src.val
         WHEN NOT MATCHED THEN INSERT (key, value) VALUES (src.key, src.val)`,
        { value: JSON.stringify(meta) }
      );
    });
  }

  private async listMemoryFilesAsync(): Promise<MemoryIndexEntry[]> {
    const memoryDir = resolveAgentDir(this.workspaceDir, this.agentId, 'memory');

    const extraPaths = this.settings.extraPaths || [];
    const allPaths = [memoryDir, ...extraPaths];

    // Process directories in parallel with semaphore
    const results = await Promise.all(
      allPaths.map(async (basePath) => {
        try {
          await fs.access(basePath);
          const entries = await fs.readdir(basePath, { withFileTypes: true });
          const filePromises = entries
            .filter(entry => entry.isFile())
            .map(async (entry) => {
              const fullPath = path.join(basePath, entry.name);
              return this.withSemaphoreAsync(async () => {
                const stat = await fs.stat(fullPath);
                const content = await fs.readFile(fullPath, 'utf-8');
                const hash = createHash('sha256').update(content).digest('hex');
                
                return {
                  path: path.relative(this.workspaceDir, fullPath),
                  absPath: fullPath,
                  mtimeMs: stat.mtimeMs,
                  size: stat.size,
                  hash,
                  content,
                } as MemoryIndexEntry;
              });
            });
          
          return await Promise.all(filePromises);
        } catch (error) {
          console.debug(`Skipping path ${basePath}:`, error.message);
          return [];
        }
      })
    );

    return results.flat();
  }

  private async listSessionFilesAsync(): Promise<MemoryIndexEntry[]> {
    if (!this.sources.has("sessions")) {
      return [];
    }

    const sessionsDir = resolveAgentDir(this.workspaceDir, this.agentId, 'sessions');

    try {
      await fs.access(sessionsDir);
      const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
      
      const filePromises = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const fullPath = path.join(sessionsDir, entry.name);
          return this.withSemaphoreAsync(async () => {
            const stat = await fs.stat(fullPath);
            const content = await fs.readFile(fullPath, 'utf-8');
            const hash = createHash('sha256').update(content).digest('hex');
            
            return {
              path: path.relative(this.workspaceDir, fullPath),
              absPath: fullPath,
              mtimeMs: stat.mtimeMs,
              size: stat.size,
              hash,
              content,
            } as MemoryIndexEntry;
          });
        });
      
      return await Promise.all(filePromises);
    } catch (error) {
      console.debug(`Sessions directory ${sessionsDir} doesn't exist or can't be accessed:`, error.message);
      return [];
    }
  }

  private async indexFileAsync(entry: MemoryIndexEntry, source: MemorySource): Promise<void> {
    await this.withTransactionAsync(async (conn) => {
      // Update or insert source
      await conn.execute(
        `MERGE INTO memory_index_sources s
         USING (SELECT :path AS path, :source AS source FROM DUAL) src
         ON (s.path = src.path AND s.source = src.source)
         WHEN MATCHED THEN UPDATE SET 
           hash = :hash,
           mtime = :mtime,
           size = :size
         WHEN NOT MATCHED THEN INSERT (path, source, hash, mtime, size)
           VALUES (:path, :source, :hash, :mtime, :size)`,
        {
          path: entry.path,
          source,
          hash: entry.hash,
          mtime: Math.floor(entry.mtimeMs),
          size: entry.size,
        }
      );

      // Delete old chunks
      await conn.execute(
        `DELETE FROM memory_index_chunks WHERE path = :path AND source = :source`,
        { path: entry.path, source }
      );

      // If content is available, index it
      if (entry.content) {
        const chunks = await this.chunkContentAsync(entry.content);
        
        // Insert chunks in parallel with semaphore
        await Promise.all(
          chunks.map(async (chunk) => {
            return this.withSemaphoreAsync(async () => {
              const chunkId = createHash('sha256')
                .update(`${entry.path}:${source}:${chunk.startLine}:${chunk.endLine}`)
                .digest('hex')
                .substring(0, 64);

              const embeddingJson = chunk.embedding ? JSON.stringify(chunk.embedding) : null;

              await conn.execute(
                `INSERT INTO memory_index_chunks 
                 (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
                 VALUES (:id, :path, :source, :start_line, :end_line, :hash, :model, :text, :embedding, :updated_at)`,
                {
                  id: chunkId,
                  path: entry.path,
                  source,
                  start_line: chunk.startLine,
                  end_line: chunk.endLine,
                  hash: createHash('sha256').update(chunk.text).digest('hex'),
                  model: this.provider?.model || 'fts-only',
                  text: chunk.text,
                  embedding: embeddingJson,
                  updated_at: Date.now(),
                }
              );
            });
          })
        );
      }
    });
  }

  private async chunkContentAsync(content: string): Promise<Array<{
    text: string;
    startLine: number;
    endLine: number;
    embedding?: number[];
  }>> {
    const lines = content.split('\n');
    const chunkSize = this.settings.chunking.tokens || 500;
    const overlap = this.settings.chunking.overlap || 50;
    const chunks: Array<{
      text: string;
      startLine: number;
      endLine: number;
      embedding?: number[];
    }> = [];

    // Simple line-based chunking
    let startLine = 0;
    while (startLine < lines.length) {
      const endLine = Math.min(startLine + chunkSize, lines.length);
      const chunkText = lines.slice(startLine, endLine).join('\n');
      
      chunks.push({
        text: chunkText,
        startLine,
        endLine: endLine - 1,
      });

      startLine += chunkSize - overlap;
      if (startLine >= lines.length) break;
    }

    // Generate embeddings if configured
    if (this.settings.store.embedding?.enabled && this.provider) {
      // Generate embeddings in parallel with semaphore
      await Promise.all(
        chunks.map(async (chunk) => {
          return this.withSemaphoreAsync(async () => {
            try {
              chunk.embedding = await this.generateEmbeddingAsync(chunk.text);
            } catch (error) {
              console.error('Failed to generate embedding:', error);
            }
          });
        })
      );
    }

    return chunks;
  }

  private async generateEmbeddingAsync(text: string): Promise<number[]> {
    // Placeholder for embedding generation
    // In real implementation, this would call the embedding provider
    throw new Error('Embedding generation not implemented');
  }

  private async syncMemoryFilesAsync(needsFullReindex: boolean): Promise<void> {
    const files = await this.listMemoryFilesAsync();

    await this.withConnectionAsync(async (conn) => {
      const existingRows = await conn.execute(
        `SELECT path, hash FROM memory_index_sources WHERE source = 'memory'`
      );
      const existingHashes = new Map<string, string>(
        existingRows.rows.map((row: any[]) => [row[0] as string, row[1] as string])
      );

      // Process files in parallel with semaphore
      const indexPromises = files
        .filter(entry => needsFullReindex || existingHashes.get(entry.path) !== entry.hash)
        .map(async (entry) => {
          return this.withSemaphoreAsync(async () => {
            await this.indexFileAsync(entry, "memory");
          });
        });

      await Promise.all(indexPromises);

      const activePaths = new Set(files.map((f) => f.path));
      const deletePromises = Array.from(existingRows.rows)
        .filter(([path]) => !activePaths.has(path))
        .map(async ([path]) => {
          return this.withSemaphoreAsync(async () => {
            await conn.execute(
              `DELETE FROM memory_index_sources WHERE path = :path AND source = 'memory'`,
              { path }
            );
            await conn.execute(
              `DELETE FROM memory_index_chunks WHERE path = :path AND source = 'memory'`,
              { path }
            );
          });
        });

      await Promise.all(deletePromises);

      this.dirty = false;
      this.dirtyFiles.clear();
    });
  }

  private async syncSessionFilesAsync(needsFullReindex: boolean): Promise<void> {
    if (!this.sources.has("sessions")) {
      return;
    }

    const files = await this.listSessionFilesAsync();

    await this.withConnectionAsync(async (conn) => {
      const existingRows = await conn.execute(
        `SELECT path, hash FROM memory_index_sources WHERE source = 'sessions'`
      );
      const existingHashes = new Map<string, string>(
        existingRows.rows.map((row: any[]) => [row[0] as string, row[1] as string])
      );

      // Process files in parallel with semaphore
      const indexPromises = files
        .filter(entry => needsFullReindex || existingHashes.get(entry.path) !== entry.hash)
        .map(async (entry) => {
          return this.withSemaphoreAsync(async () => {
            await this.indexFileAsync(entry, "sessions");
          });
        });

      await Promise.all(indexPromises);

      const activePaths = new Set(files.map((f) => f.path));
      const deletePromises = Array.from(existingRows.rows)
        .filter(([path]) => !activePaths.has(path))
        .map(async ([path]) => {
          return this.withSemaphoreAsync(async () => {
            await conn.execute(
              `DELETE FROM memory_index_sources WHERE path = :path AND source = 'sessions'`,
              { path }
            );
            await conn.execute(
              `DELETE FROM memory_index_chunks WHERE path = :path AND source = 'sessions'`,
              { path }
            );
          });
        });

      await Promise.all(deletePromises);

      this.sessionsDirty = false;
      this.sessionsDirtyFiles.clear();
    });
  }

  async syncAsync(params?: { reason?: string; force?: boolean }): Promise<void> {
    if (this.closed) {
      throw new Error('MemoryManager is closed');
    }

    // Prevent concurrent syncs
    if (this.isSyncing) {
      // Queue the sync request
      return new Promise((resolve, reject) => {
        this.syncQueue.push(async () => {
          try {
            await this.performSyncAsync(params);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        this.processQueueAsync().catch(console.error);
      });
    }

    this.isSyncing = true;
    try {
      await this.performSyncAsync(params);
    } finally {
      this.isSyncing = false;
      // Process any queued syncs
      await this.processQueueAsync();
    }
  }

  private async processQueueAsync(): Promise<void> {
    if (this.isProcessingQueue || this.syncQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    try {
      while (this.syncQueue.length > 0) {
        const task = this.syncQueue.shift();
        if (task) {
          await task();
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async performSyncAsync(params?: { reason?: string; force?: boolean }): Promise<void> {
    await this.ensureTablesAsync();

    const meta = await this.readMetaAsync();
    const needsFullReindex = params?.force || !meta;

    // Run syncs in parallel
    await Promise.all([
      this.syncMemoryFilesAsync(needsFullReindex),
      this.sources.has("sessions") ? this.syncSessionFilesAsync(needsFullReindex) : Promise.resolve()
    ]);

    if (needsFullReindex) {
      await this.writeMetaAsync({
        model: this.provider?.model ?? "fts-only",
        provider: this.provider?.id ?? "none",
        providerKey: this.providerKey!,
        sources: resolveConfiguredSourcesForMeta(Array.from(this.sources)),
        scopeHash: resolveConfiguredScopeHash({
          workspaceDir: this.workspaceDir,
          extraPaths: this.settings.extraPaths,
          multimodal: this.settings.multimodal,
        }),
        chunkTokens: this.settings.chunking.tokens,
        chunkOverlap: this.settings.chunking.overlap,
        ftsTokenizer: this.settings.store.fts.tokenizer,
        updatedAt: Date.now(),
      });
    }

    this.emit('synced', { reason: params?.reason || 'manual', force: params?.force });
  }

  async startWatchingAsync(): Promise<void> {
    if (this.watcher) {
      return;
    }

    // Start watching memory files
    const memoryDir = resolveAgentDir(this.workspaceDir, this.agentId, 'memory');
    try {
      await fs.mkdir(memoryDir, { recursive: true });
      
      // Using polling interval (async)
      this.intervalTimer = setInterval(async () => {
        if (!this.closed && !this.dirty) {
          try {
            await this.syncAsync({ reason: 'interval' });
          } catch (error) {
            console.error('Interval sync failed:', error);
          }
        }
      }, this.settings.syncInterval || 30000);
    } catch (error) {
      console.error('Failed to start memory watcher:', error);
    }

    // Start watching sessions if enabled
    if (this.sources.has("sessions")) {
      const sessionsDir = resolveAgentDir(this.workspaceDir, this.agentId, 'sessions');
      try {
        await fs.mkdir(sessionsDir, { recursive: true });
        this.sessionUnsubscribe = this.watchSessionsAsync();
      } catch (error) {
        console.error('Failed to start session watcher:', error);
      }
    }
  }

  private watchSessionsAsync(): () => void {
    // Placeholder for session watching implementation
    // Should return unsubscribe function
    return () => {};
  }

  async registerSessionListenerAsync(
    sessionId: string,
    listener: (event: SessionEvent) => void
  ): Promise<void> {
    if (!this.sessionListeners.has(sessionId)) {
      this.sessionListeners.set(sessionId, new Set());
    }
    this.sessionListeners.get(sessionId)!.add(listener);
  }

  async unregisterSessionListenerAsync(
    sessionId: string,
    listener: (event: SessionEvent) => void
  ): Promise<void> {
    const listeners = this.sessionListeners.get(sessionId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.sessionListeners.delete(sessionId);
      }
    }
  }

  private async emitSessionEventAsync(event: SessionEvent): Promise<void> {
    const listeners = this.sessionListeners.get(event.sessionId);
    if (listeners) {
      await Promise.all(
        Array.from(listeners).map(async (listener) => {
          try {
            listener(event);
          } catch (error) {
            console.error('Error in session listener:', error);
          }
        })
      );
    }
    this.emit('session-event', event);
  }

  async getMemoryStatsAsync(): Promise<{
    totalFiles: number;
    totalChunks: number;
    totalSize: number;
    lastSync: number;
  }> {
    return this.withConnectionAsync(async (conn) => {
      const result = await conn.execute(
        `SELECT 
          COUNT(DISTINCT path) as files,
          COUNT(*) as chunks,
          SUM(size) as size
         FROM memory_index_sources s
         JOIN memory_index_chunks c ON s.path = c.path AND s.source = c.source
         WHERE s.source = 'memory'`
      );
      
      const row = result.rows[0];
      return {
        totalFiles: Number(row[0]),
        totalChunks: Number(row[1]),
        totalSize: Number(row[2]),
        lastSync: Date.now(),
      };
    });
  }

  async getSessionStatsAsync(): Promise<{
    totalSessions: number;
    totalChunks: number;
    totalSize: number;
    lastSync: number;
  }> {
    if (!this.sources.has("sessions")) {
      return {
        totalSessions: 0,
        totalChunks: 0,
        totalSize: 0,
        lastSync: Date.now(),
      };
    }

    return this.withConnectionAsync(async (conn) => {
      const result = await conn.execute(
        `SELECT 
          COUNT(DISTINCT path) as sessions,
          COUNT(*) as chunks,
          SUM(size) as size
         FROM memory_index_sources s
         JOIN memory_index_chunks c ON s.path = c.path AND s.source = c.source
         WHERE s.source = 'sessions'`
      );
      
      const row = result.rows[0];
      return {
        totalSessions: Number(row[0]),
        totalChunks: Number(row[1]),
        totalSize: Number(row[2]),
        lastSync: Date.now(),
      };
    });
  }

  async closeAsync(): Promise<void> {
    if (this.closed) {
      return;
    }

    // Stop watchers
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Clear timers
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
      this.watchTimer = null;
    }
    if (this.sessionWatchTimer) {
      clearTimeout(this.sessionWatchTimer);
      this.sessionWatchTimer = null;
    }

    // Wait for any pending syncs
    while (this.isSyncing || this.isProcessingQueue) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Close pool
    if (this.pool) {
      await this.pool.close();
    }

    // Unsubscribe from sessions
    if (this.sessionUnsubscribe) {
      this.sessionUnsubscribe();
      this.sessionUnsubscribe = null;
    }

    // Clear session listeners
    this.sessionListeners.clear();
    this.removeAllListeners();

    this.closed = true;
    this.emit('closed');
  }

  // Public API methods

  async searchMemoryAsync(query: string, limit?: number): Promise<Array<{
    path: string;
    text: string;
    score: number;
  }>> {
    // Simple FTS search
    return this.withConnectionAsync(async (conn) => {
      const searchLimit = limit || 10;
      const result = await conn.execute(
        `SELECT path, text, 1.0 as score
         FROM memory_index_chunks
         WHERE source = 'memory'
           AND UPPER(text) LIKE UPPER('%' || :query || '%')
         ORDER BY score DESC
         FETCH FIRST :limit ROWS ONLY`,
        { query, limit: searchLimit }
      );
      
      return result.rows.map((row: any[]) => ({
        path: row[0],
        text: row[1],
        score: row[2],
      }));
    });
  }

  async searchSessionsAsync(query: string, limit?: number): Promise<Array<{
    path: string;
    text: string;
    score: number;
    sessionId?: string;
  }>> {
    if (!this.sources.has("sessions")) {
      return [];
    }

    return this.withConnectionAsync(async (conn) => {
      const searchLimit = limit || 10;
      const result = await conn.execute(
        `SELECT path, text, 1.0 as score
         FROM memory_index_chunks
         WHERE source = 'sessions'
           AND UPPER(text) LIKE UPPER('%' || :query || '%')
         ORDER BY score DESC
         FETCH FIRST :limit ROWS ONLY`,
        { query, limit: searchLimit }
      );
      
      return result.rows.map((row: any[]) => ({
        path: row[0],
        text: row[1],
        score: row[2],
        sessionId: path.basename(row[0], '.json'),
      }));
    });
  }

  async getDirtyFilesAsync(): Promise<{
    memory: string[];
    sessions: string[];
  }> {
    return {
      memory: Array.from(this.dirtyFiles),
      sessions: Array.from(this.sessionsDirtyFiles),
    };
  }

  async isDirtyAsync(): Promise<{
    memory: boolean;
    sessions: boolean;
  }> {
    return {
      memory: this.dirty,
      sessions: this.sessionsDirty,
    };
  }
}