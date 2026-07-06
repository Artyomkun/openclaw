/**
 * Memory Core Plugin - Oracle Embedding Operations Manager
 * 
 * Simple implementation of embedding operations for Oracle.
 * Main responsibilities:
 * 1. Generate embeddings with caching
 * 2. Batch processing with retries
 * 3. Save to Oracle with transactions
 */

import fs from "node:fs/promises";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import {
  enforceEmbeddingMaxInputTokens,
  type EmbeddingInput,
  type MemoryEmbeddingProviderRuntime,
} from "openclaw/plugin-sdk/memory-core-host-engine-embeddings";
import { createSubsystemLogger } from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import {
  buildMultimodalChunkForIndexing,
  chunkMarkdown,
  hashText,
  remapChunkLines,
  runWithConcurrency,
  type MemoryChunk,
  type MemorySource,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";
import { resolveTimerTimeoutMs } from "openclaw/plugin-sdk/number-runtime";
import {
  MEMORY_BATCH_FAILURE_LIMIT,
  recordMemoryBatchFailure,
  resetMemoryBatchFailureState,
} from "./manager-batch-state.js";
import {
  collectMemoryCachedEmbeddings,
  loadMemoryEmbeddingCache,
  upsertMemoryEmbeddingCache,
} from "./manager-embedding-cache.js";
import { createMemoryEmbeddingOperationError } from "./manager-embedding-errors.js";
import {
  buildMemoryEmbeddingBatches,
  buildTextEmbeddingInputs,
  filterNonEmptyMemoryChunks,
  isRetryableMemoryEmbeddingError,
  runMemoryEmbeddingBatchRetryWithSplit,
  runMemoryEmbeddingRetryLoop,
} from "./manager-embedding-policy.js";
import {
  resolveMemoryIndexProviderIdentities,
  type MemoryIndexProviderIdentity,
} from "./manager-reindex-state.js";
import { logMemoryVectorDegradedWrite } from "./manager-vector-warning.js";
import { replaceMemoryVectorRow } from "./manager-vector-write.js";

// ========================================================================
// Constants
// ========================================================================

const VECTOR_TABLE = "memory_index_chunks_vec";
const FTS_TABLE = "memory_index_chunks_fts";
const EMBEDDING_CACHE_TABLE = "memory_embedding_cache";

const EMBEDDING_BATCH_MAX_TOKENS = 8000;
const EMBEDDING_INDEX_CONCURRENCY = 4;
const EMBEDDING_RETRY_MAX_ATTEMPTS = 3;
const EMBEDDING_RETRY_BASE_DELAY_MS = 500;
const EMBEDDING_RETRY_MAX_DELAY_MS = 8000;

const log = createSubsystemLogger("memory");

// ========================================================================
// Main Class
// ========================================================================

/**
 * Abstract base class for embedding operations with Oracle backend.
 * 
 * Handles:
 * - Embedding generation with LRU cache
 * - Batch processing with automatic retry and split
 * - Oracle transaction management
 * - Circuit breaker for batch failures
 */
export abstract class MemoryManagerEmbeddingOps {
  // Abstract properties - implemented by subclass
  protected abstract db: any; // Oracle connection
  protected abstract provider: { id: string; model: string } | null;
  protected abstract providerRuntime?: MemoryEmbeddingProviderRuntime;
  protected abstract providerKey: string;
  protected abstract agentId?: string;
  protected abstract cache: { enabled: boolean; maxEntries?: number };
  protected abstract batch: { enabled: boolean; concurrency: number };
  protected abstract settings: any;
  protected abstract vector: { enabled: boolean; loadError?: Error };
  protected abstract fts: { enabled: boolean; available: boolean };
  protected abstract vectorDegradedWriteWarningShown: boolean;

  protected abstract batchFailureCount: number;
  protected abstract batchFailureLastError?: string;
  protected abstract batchFailureLastProvider?: string;
  protected abstract batchFailureLock: Promise<void>;

  protected abstract ensureVectorReady(dims: number): Promise<boolean>;
  protected abstract markLocalEmbeddingProviderDegraded(err: unknown): void;

  // ========================================================================
  // Cache Management
  // ========================================================================

  /**
   * Prunes old cache entries to prevent unlimited growth.
   * Uses LRU strategy - removes oldest entries first.
   * Oracle-specific: uses ROWID for efficient deletion.
   */
  protected pruneEmbeddingCacheIfNeeded(): void {
    if (!this.cache.enabled || !this.cache.maxEntries) return;

    const count = this.db.execute(
      `SELECT COUNT(*) FROM ${EMBEDDING_CACHE_TABLE}`
    ).rows?.[0]?.[0] as number ?? 0;

    if (count > this.cache.maxEntries) {
      this.db.execute(
        `DELETE FROM ${EMBEDDING_CACHE_TABLE}
         WHERE ROWID IN (
           SELECT ROWID FROM ${EMBEDDING_CACHE_TABLE}
           ORDER BY updated_at ASC
           FETCH FIRST ${count - this.cache.maxEntries} ROWS ONLY
         )`
      );
    }
  }

  // ========================================================================
  // Embedding Generation
  // ========================================================================

  /**
   * Gets embeddings for chunks with caching.
   * 
   * Flow:
   * 1. Check cache for existing embeddings
   * 2. Generate missing embeddings in batches
   * 3. Save new embeddings to cache
   * 
   * @param chunks - Text chunks to embed
   * @returns Array of embedding vectors
   */
  private async embedChunks(chunks: MemoryChunk[]): Promise<number[][]> {
    if (chunks.length === 0) return [];

    // Step 1: Check cache
    const { embeddings, missing } = this.collectCachedEmbeddings(chunks);
    if (missing.length === 0) return embeddings;

    // Step 2: Generate missing
    const provider = this.provider;
    if (!provider) {
      throw new Error("No embedding provider");
    }

    const missingChunks = missing.map(m => m.chunk);
    const batches = buildMemoryEmbeddingBatches(missingChunks, EMBEDDING_BATCH_MAX_TOKENS);

    let cursor = 0;
    for (const batch of batches) {
      const texts = batch.map(c => c.text);
      const batchEmbeddings = await this.embedBatchWithRetry(texts);

      // Step 3: Save to cache
      const cacheEntries = [];
      for (let i = 0; i < batch.length; i++) {
        const item = missing[cursor + i];
        if (item) {
          embeddings[item.index] = batchEmbeddings[i] ?? [];
          cacheEntries.push({ 
            hash: item.chunk.hash, 
            embedding: embeddings[item.index] 
          });
        }
      }
      this.upsertEmbeddingCache(cacheEntries);
      cursor += batch.length;
    }

    return embeddings;
  }

  /**
   * Checks cache for existing embeddings.
   * 
   * @param chunks - Chunks to check
   * @returns Cached embeddings and missing chunks
   */
  private collectCachedEmbeddings(chunks: MemoryChunk[]): {
    embeddings: number[][];
    missing: Array<{ index: number; chunk: MemoryChunk }>;
  } {
    const hashes = chunks.map(c => c.hash);
    const cached = loadMemoryEmbeddingCache({
      db: this.db,
      enabled: this.cache.enabled,
      providerIdentities: this.provider ? this.resolveProviderIdentities() : [],
      hashes,
      tableName: EMBEDDING_CACHE_TABLE,
    });

    return collectMemoryCachedEmbeddings({ chunks, cached });
  }

  /**
   * Saves embeddings to cache.
   * Oracle-specific: uses MERGE for atomic upsert.
   */
  private upsertEmbeddingCache(
    entries: Array<{ hash: string; embedding: number[] }>
  ): void {
    upsertMemoryEmbeddingCache({
      db: this.db,
      enabled: this.cache.enabled,
      provider: this.provider,
      providerKey: this.providerKey,
      entries,
      tableName: EMBEDDING_CACHE_TABLE,
    });
  }

  /**
   * Resolves provider identities for cache key.
   */
  protected resolveProviderIdentities(): MemoryIndexProviderIdentity[] {
    return resolveMemoryIndexProviderIdentities({
      provider: this.provider,
      cacheKeyData: this.providerRuntime?.cacheKeyData,
      aliases: this.providerRuntime?.indexIdentityAliases,
    });
  }

  // ========================================================================
  // Batch Operations
  // ========================================================================

  /**
   * Generates embeddings in batch with retry and split strategy.
   * 
   * Strategy:
   * 1. Try full batch
   * 2. If fails with retryable error, retry with backoff
   * 3. If still fails, split batch in half and retry each half
   * 4. Continue until all items processed
   * 
   * @param texts - Texts to embed
   * @returns Array of embedding vectors
   */
  protected async embedBatchWithRetry(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const provider = this.provider;
    if (!provider) throw new Error("No embedding provider");

    try {
      return await runMemoryEmbeddingBatchRetryWithSplit({
        items: texts,
        run: async (batch) => {
          return await provider.embedBatch(batch);
        },
        isRetryable: isRetryableMemoryEmbeddingError,
        isSplittable: () => true,
        waitForRetry: async (delay) => {
          log.warn(`Retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        },
        maxAttempts: EMBEDDING_RETRY_MAX_ATTEMPTS,
        baseDelayMs: EMBEDDING_RETRY_BASE_DELAY_MS,
        onSplit: ({ itemCount, splitAt }) => {
          log.warn(`Splitting batch: ${itemCount} -> ${splitAt} + ${itemCount - splitAt}`);
        },
      });
    } catch (err) {
      this.markLocalEmbeddingProviderDegraded(err);
      throw createMemoryEmbeddingOperationError({
        operation: "batch",
        providerId: provider.id,
        cause: err,
      });
    }
  }

  /**
   * Generates single embedding with retry.
   * 
   * @param text - Text to embed
   * @returns Embedding vector
   */
  protected async embedQueryWithRetry(text: string): Promise<number[]> {
    const provider = this.provider;
    if (!provider) throw new Error("No embedding provider");

    try {
      return await runMemoryEmbeddingRetryLoop({
        run: async () => await provider.embedQuery(text),
        isRetryable: isRetryableMemoryEmbeddingError,
        waitForRetry: async (delay) => {
          log.warn(`Retrying query in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        },
        maxAttempts: EMBEDDING_RETRY_MAX_ATTEMPTS,
        baseDelayMs: EMBEDDING_RETRY_BASE_DELAY_MS,
      });
    } catch (err) {
      this.markLocalEmbeddingProviderDegraded(err);
      throw createMemoryEmbeddingOperationError({
        operation: "query",
        providerId: provider.id,
        cause: err,
      });
    }
  }

  // ========================================================================
  // Circuit Breaker - Batch Failure Management
  // ========================================================================

  /**
   * Resets batch failure count on success.
   * Called after successful batch operation.
   */
  private async resetBatchFailureCount(): Promise<void> {
    await this.withBatchFailureLock(async () => {
      if (this.batchFailureCount > 0) {
        log.debug("Batch recovered; resetting failure count");
      }
      const nextState = resetMemoryBatchFailureState({
        enabled: this.batch.enabled,
        count: this.batchFailureCount,
        lastError: this.batchFailureLastError,
        lastProvider: this.batchFailureLastProvider,
      });
      this.batch.enabled = nextState.enabled;
      this.batchFailureCount = nextState.count;
      this.batchFailureLastError = nextState.lastError;
      this.batchFailureLastProvider = nextState.lastProvider;
    });
  }

  /**
   * Records a batch failure and updates circuit breaker.
   * 
   * @param params - Failure details
   * @returns Whether batch is disabled and current failure count
   */
  private async recordBatchFailure(params: {
    provider: string;
    message: string;
    attempts?: number;
    forceDisable?: boolean;
  }): Promise<{ disabled: boolean; count: number }> {
    return await this.withBatchFailureLock(async () => {
      if (!this.batch.enabled) {
        return { disabled: true, count: this.batchFailureCount };
      }

      const nextState = recordMemoryBatchFailure(
        {
          enabled: this.batch.enabled,
          count: this.batchFailureCount,
          lastError: this.batchFailureLastError,
          lastProvider: this.batchFailureLastProvider,
        },
        params,
      );

      this.batch.enabled = nextState.enabled;
      this.batchFailureCount = nextState.count;
      this.batchFailureLastError = nextState.lastError;
      this.batchFailureLastProvider = nextState.lastProvider;

      return { disabled: !nextState.enabled, count: nextState.count };
    });
  }

  /**
   * Executes function with batch failure lock.
   * Prevents race conditions when updating failure state.
   */
  private async withBatchFailureLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const wait = this.batchFailureLock;
    this.batchFailureLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await wait;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  /**
   * Checks if error is a timeout.
   */
  private isBatchTimeoutError(message: string): boolean {
    return /timed out|timeout/i.test(message);
  }

  /**
   * Runs batch with timeout retry.
   * Retries once if timeout occurs.
   */
  private async runBatchWithTimeoutRetry<T>(params: {
    provider: string;
    run: () => Promise<T>;
  }): Promise<T> {
    try {
      return await params.run();
    } catch (err) {
      const message = formatErrorMessage(err);
      if (this.isBatchTimeoutError(message)) {
        log.warn(`${params.provider} batch timed out; retrying once`);
        try {
          return await params.run();
        } catch (retryErr) {
          (retryErr as { batchAttempts?: number }).batchAttempts = 2;
          throw retryErr;
        }
      }
      throw err;
    }
  }

  /**
   * Runs batch with fallback using circuit breaker.
   * 
   * Strategy:
   * 1. Try batch with timeout retry
   * 2. If fails, record failure
   * 3. If threshold exceeded, disable batch mode
   * 4. Fallback to non-batch processing
   */
  private async runBatchWithFallback<T>(params: {
    provider: string;
    run: () => Promise<T>;
    fallback: () => Promise<number[][]>;
  }): Promise<T | number[][]> {
    if (!this.batch.enabled) {
      return await params.fallback();
    }

    try {
      const result = await this.runBatchWithTimeoutRetry({
        provider: params.provider,
        run: params.run,
      });
      await this.resetBatchFailureCount();
      return result;
    } catch (err) {
      const message = formatErrorMessage(err);
      const attempts = (err as { batchAttempts?: number }).batchAttempts ?? 1;
      const forceDisable = /asyncBatchEmbedContent not available/i.test(message);

      const failure = await this.recordBatchFailure({
        provider: params.provider,
        message,
        attempts,
        forceDisable,
      });

      const suffix = failure.disabled ? "disabling batch" : "keeping batch enabled";
      log.warn(
        `${params.provider} batch failed (${failure.count}/${MEMORY_BATCH_FAILURE_LIMIT}); ${suffix}; falling back to non-batch: ${message}`
      );

      return await params.fallback();
    }
  }

  // ========================================================================
  // Indexing Operations
  // ========================================================================

  /**
   * Gets concurrency for indexing.
   * Uses provider-specific limits.
   */
  protected getIndexConcurrency(): number {
    if (this.batch.enabled) {
      return this.batch.concurrency;
    }
    const configured = this.settings.remote?.nonBatchConcurrency;
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return Math.max(1, Math.floor(configured));
    }
    return this.provider?.id === "ollama" ? 1 : EMBEDDING_INDEX_CONCURRENCY;
  }

  /**
   * Clears indexed data for a file.
   * Deletes from vector, FTS, and chunks tables.
   * Oracle-specific: uses subquery for cascade delete.
   */
  private clearIndexedFileData(pathname: string, source: MemorySource): void {
    // Delete vector data
    if (this.vector.enabled) {
      try {
        this.db.execute(
          `DELETE FROM ${VECTOR_TABLE}
           WHERE id IN (SELECT id FROM memory_index_chunks WHERE path = :path AND source = :source)`,
          { path: pathname, source }
        );
      } catch {}
    }

    // Delete FTS data
    if (this.fts.enabled && this.fts.available) {
      try {
        this.db.execute(
          `DELETE FROM ${FTS_TABLE} WHERE path = :path AND source = :source`,
          { path: pathname, source }
        );
      } catch {}
    }

    // Delete chunks
    this.db.execute(
      `DELETE FROM memory_index_chunks WHERE path = :path AND source = :source`,
      { path: pathname, source }
    );
  }

  /**
   * Upserts file record.
   * Oracle-specific: uses MERGE for atomic upsert.
   */
  private upsertFileRecord(entry: any, source: MemorySource): void {
    this.db.execute(
      `MERGE INTO memory_index_sources target
       USING (SELECT :path AS path, :source AS source, :hash AS hash, 
                     :mtime AS mtime, :size AS size FROM DUAL) source
       ON (target.path = source.path AND target.source = source.source)
       WHEN MATCHED THEN
         UPDATE SET target.hash = source.hash, target.mtime = source.mtime, target.size = source.size
       WHEN NOT MATCHED THEN
         INSERT (path, source, hash, mtime, size)
         VALUES (source.path, source.source, source.hash, source.mtime, source.size)`,
      {
        path: entry.path,
        source,
        hash: entry.hash,
        mtime: entry.mtimeMs,
        size: entry.size,
      }
    );
  }

  /**
   * Deletes file record.
   */
  private deleteFileRecord(pathname: string, source: MemorySource): void {
    this.db.execute(
      `DELETE FROM memory_index_sources WHERE path = :path AND source = :source`,
      { path: pathname, source }
    );
  }

  /**
   * Writes chunks to database with transaction.
   * Oracle-specific: uses BEGIN/COMMIT/ROLLBACK for atomic writes.
   * Uses MERGE for upsert and handles vector storage.
   */
  private writeChunks(
    entry: any,
    source: MemorySource,
    model: string,
    chunks: MemoryChunk[],
    embeddings: number[][],
    vectorReady: boolean,
  ): void {
    const now = Date.now();

    // Start transaction
    this.db.execute('BEGIN');

    try {
      // Clear existing data
      this.clearIndexedFileData(entry.path, source);

      // Insert chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i] ?? [];
        const id = hashText(
          `${source}:${entry.path}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}:${model}`,
        );

        // Insert or update chunk
        this.db.execute(
          `MERGE INTO memory_index_chunks target
           USING (SELECT :id AS id, :path AS path, :source AS source,
                         :startLine AS start_line, :endLine AS end_line,
                         :hash AS hash, :model AS model, :text AS text,
                         :embedding AS embedding, :updatedAt AS updated_at FROM DUAL) source
           ON (target.id = source.id)
           WHEN MATCHED THEN
             UPDATE SET target.hash = source.hash, target.model = source.model,
                        target.text = source.text, target.embedding = source.embedding,
                        target.updated_at = source.updated_at
           WHEN NOT MATCHED THEN
             INSERT (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
             VALUES (source.id, source.path, source.source, source.start_line,
                     source.end_line, source.hash, source.model, source.text,
                     source.embedding, source.updated_at)`,
          {
            id,
            path: entry.path,
            source,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            hash: chunk.hash,
            model,
            text: chunk.text,
            embedding: JSON.stringify(embedding),
            updatedAt: now,
          }
        );

        // Store vector if ready
        if (vectorReady && embedding.length > 0) {
          replaceMemoryVectorRow({
            db: this.db,
            tableName: VECTOR_TABLE,
            id,
            embedding,
          });
        }

        // Insert FTS if enabled
        if (this.fts.enabled && this.fts.available) {
          this.db.execute(
            `INSERT INTO ${FTS_TABLE} (text, id, path, source, model, start_line, end_line)
             VALUES (:text, :id, :path, :source, :model, :startLine, :endLine)`,
            {
              text: chunk.text,
              id,
              path: entry.path,
              source,
              model,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
            }
          );
        }
      }

      // Update file record
      this.upsertFileRecord(entry, source);

      // Commit transaction
      this.db.execute('COMMIT');
    } catch (error) {
      // Rollback on error
      this.db.execute('ROLLBACK');
      throw error;
    }

    // Log vector degradation warning if needed
    this.vectorDegradedWriteWarningShown = logMemoryVectorDegradedWrite({
      vectorEnabled: this.vector.enabled,
      vectorReady,
      chunkCount: chunks.length,
      warningShown: this.vectorDegradedWriteWarningShown,
      loadError: this.vector.loadError,
      warn: (message) => log.warn(message),
    });
  }

  /**
   * Prepares index entry for processing.
   * Handles both text and multimodal entries.
   */
  private async prepareIndexEntry(
    entry: any,
    options: { source: MemorySource; content?: string },
  ): Promise<any> {
    // Handle multimodal entries
    if ("kind" in entry && entry.kind === "multimodal") {
      const multimodalChunk = await buildMultimodalChunkForIndexing(entry);
      if (!multimodalChunk) {
        this.clearIndexedFileData(entry.path, options.source);
        this.deleteFileRecord(entry.path, options.source);
        return null;
      }
      return {
        entry,
        source: options.source,
        chunks: [multimodalChunk.chunk],
        structuredInputBytes: multimodalChunk.structuredInputBytes,
      };
    }

    // Handle text entries
    const content =
      options.content ??
      entry.content ??
      (await fs.readFile(entry.absPath, "utf-8"));

    const baseChunks = filterNonEmptyMemoryChunks(
      chunkMarkdown(content, this.settings.chunking)
    );
    const chunks = this.provider
      ? enforceEmbeddingMaxInputTokens(this.provider, baseChunks, EMBEDDING_BATCH_MAX_TOKENS)
      : baseChunks;

    if (options.source === "sessions" && "lineMap" in entry) {
      remapChunkLines(chunks, entry.lineMap);
    }

    return { entry, source: options.source, chunks };
  }

  // ========================================================================
  // Public Methods
  // ========================================================================

  /**
   * Indexes a single file.
   * 
   * @param entry - File entry to index
   * @param options - Source and content options
   */
  protected async indexFile(
    entry: any,
    options: { source: MemorySource; content?: string },
  ): Promise<void> {
    // FTS-only mode: no embedding provider
    if (!this.provider) {
      if ("kind" in entry && entry.kind === "multimodal") {
        return;
      }
      const prepared = await this.prepareIndexEntry(entry, options);
      this.writeChunks(
        entry, 
        options.source, 
        "fts-only", 
        prepared?.chunks ?? [], 
        [], 
        false
      );
      return;
    }

    const prepared = await this.prepareIndexEntry(entry, options);
    if (!prepared) {
      return;
    }

    let embeddings: number[][];
    try {
      embeddings = this.batch.enabled
        ? await this.embedChunksWithBatch(prepared.chunks, entry, options.source)
        : await this.embedChunks(prepared.chunks);
    } catch (err) {
      const message = formatErrorMessage(err);
      if (
        "kind" in entry &&
        entry.kind === "multimodal" &&
        /(413|payload too large|request too large|input too large|too many tokens|input limit|request size)/i.test(
          message,
        )
      ) {
        log.warn("Skipping multimodal file rejected as too large", {
          path: entry.path,
          bytes: prepared.structuredInputBytes,
          provider: this.provider.id,
          model: this.provider.model,
          error: message,
        });
        this.clearIndexedFileData(entry.path, options.source);
        this.upsertFileRecord(entry, options.source);
        return;
      }
      throw err;
    }

    const sample = embeddings.find(e => e.length > 0);
    const vectorReady = sample ? await this.ensureVectorReady(sample.length) : false;

    this.writeChunks(
      entry,
      options.source,
      this.provider.model,
      prepared.chunks,
      embeddings,
      vectorReady,
    );
  }

  /**
   * Indexes multiple files with optional batching.
   * 
   * @param items - Files to index
   */
  protected async indexFiles(items: any[]): Promise<void> {
    if (items.length === 0) return;

    const provider = this.provider;
    const batchEmbed = this.providerRuntime?.batchEmbed;

    // If no batch support, process individually
    if (
      !provider ||
      !this.batch.enabled ||
      !batchEmbed ||
      this.providerRuntime?.sourceWideBatchEmbed !== true
    ) {
      await runWithConcurrency(
        items.map(item => async () => 
          await this.indexFile(item.entry, { source: item.source })
        ),
        this.getIndexConcurrency(),
      );
      return;
    }

    // Process with batching
    for (const item of items) {
      await this.indexFile(item.entry, { source: item.source });
    }
  }

  /**
   * Embeds chunks using batch API with fallback.
   * Uses circuit breaker pattern.
   */
  private async embedChunksWithBatch(
    chunks: MemoryChunk[],
    entry: any,
    source: string,
  ): Promise<number[][]> {
    const provider = this.provider;
    const batchEmbed = this.providerRuntime?.batchEmbed;

    if (!provider || !batchEmbed) {
      return this.embedChunks(chunks);
    }

    if (chunks.length === 0) {
      return [];
    }

    // Check cache first
    const { embeddings, missing } = this.collectCachedEmbeddings(chunks);
    if (missing.length === 0) {
      return embeddings;
    }

    const missingChunks = missing.map(item => item.chunk);

    // Try batch with circuit breaker
    const batchResult = await this.runBatchWithFallback({
      provider: provider.id,
      run: async () =>
        await batchEmbed({
          agentId: this.agentId,
          chunks: missingChunks,
          wait: this.batch.wait,
          concurrency: this.batch.concurrency,
          pollIntervalMs: this.batch.pollIntervalMs,
          timeoutMs: this.batch.timeoutMs,
        }),
      fallback: async () => await this.embedChunks(missingChunks),
    });

    if (!batchResult) {
      return this.embedChunks(chunks);
    }

    // Cache results
    const toCache: Array<{ hash: string; embedding: number[] }> = [];
    for (let index = 0; index < missing.length; index++) {
      const item = missing[index];
      const embedding = batchResult[index] ?? [];
      if (!item) continue;
      embeddings[item.index] = embedding;
      toCache.push({ hash: item.chunk.hash, embedding });
    }
    this.upsertEmbeddingCache(toCache);

    return embeddings;
  }
}