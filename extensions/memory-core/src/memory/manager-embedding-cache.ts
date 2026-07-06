/**
 * Memory Core Plugin - Embedding Cache Manager (Oracle)
 * 
 * ARCHITECTURAL PATTERN: Optimistic Caching with Batch Operations
 * 
 * This module implements a caching layer for embedding vectors to avoid
 * redundant API calls to embedding providers.
 * 
 * KEY ARCHITECTURAL DECISIONS:
 * 
 * 1. Batch Processing
 *    - Loads embeddings in batches to avoid excessive round trips
 *    - Batch size optimized for Oracle performance (400 items)
 *    - Reduces network overhead and improves throughput
 * 
 * 2. Provider-Specific Caching
 *    - Cache is keyed by (provider, model, provider_key, hash)
 *    - Different providers/models have separate cache entries
 *    - Prevents cross-provider contamination
 * 
 * 3. Upsert with Conflict Resolution
 *    - Uses Oracle MERGE for atomic upsert operations
 *    - Updates embedding, dimensions, and timestamp on conflict
 *    - Maintains cache freshness without duplicates
 * 
 * 4. Lazy Loading
 *    - Only loads embeddings that are actually needed
 *    - Missing embeddings are collected for batch generation
 *    - Efficient memory usage with Map-based caching
 * 
 * 5. Oracle Optimizations
 *    - Uses CLOB for embedding storage (JSON format)
 *    - Batch placeholders for IN clause queries
 *    - Prepared statements for performance
 */

import oracledb from "oracledb";
import {
  parseEmbedding,
  type MemoryChunk,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";

// ========================================================================
// Types
// ========================================================================

/** Database connection interface for cache operations */
type EmbeddingCacheDb = {
  execute: (sql: string, binds?: any) => Promise<oracledb.Result<any>>;
  prepare: (sql: string) => Promise<oracledb.PreparedStatement>;
};

/** Provider identity for cache key */
type EmbeddingProviderIdentity = {
  provider: string;
  model: string;
  providerKey: string;
};

/** Cache entry for storage */
interface EmbeddingCacheEntry {
  hash: string;
  embedding: number[];
  dims: number;
  updatedAt: Date;
}

// ========================================================================
// Cache Loading - Batch Fetch
// ========================================================================

/**
 * Loads cached embeddings from Oracle database
 * 
 * ARCHITECTURE: Batch loading with provider-specific queries.
 * 
 * OPTIMIZATION STRATEGIES:
 * 1. Deduplicates input hashes to minimize queries
 * 2. Batches IN clause to avoid SQL length limits
 * 3. Queries all providers in parallel for performance
 * 4. Returns Map for O(1) lookup performance
 * 
 * ORACLE SPECIFICS:
 * - Uses CLOB extraction for embedding data
 * - Batch size 400 (Oracle IN clause limit is 1000)
 * - JSON stored as CLOB, parsed with parseEmbedding
 */
export async function loadMemoryEmbeddingCacheAsync(params: {
  db: EmbeddingCacheDb;
  enabled: boolean;
  providerIdentities: EmbeddingProviderIdentity[];
  hashes: string[];
  tableName?: string;
  pool: oracledb.Pool; // Added for connection management
}): Promise<Map<string, number[]>> {
  // Early exit if caching is disabled or no data to load
  if (!params.enabled || params.providerIdentities.length === 0 || params.hashes.length === 0) {
    return new Map();
  }

  // Deduplicate hashes for efficiency
  const uniqueHashes: string[] = [];
  const seen = new Set<string>();
  for (const hash of params.hashes) {
    if (!hash || seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    uniqueHashes.push(hash);
  }

  if (uniqueHashes.length === 0) {
    return new Map();
  }

  const tableName = params.tableName ?? "memory_embedding_cache";
  const out = new Map<string, number[]>();
  const batchSize = 400; // Oracle's IN clause limit

  // Query each provider identity independently
  for (const identity of params.providerIdentities) {
    // Process hashes in batches to avoid SQL length limits
    for (let start = 0; start < uniqueHashes.length; start += batchSize) {
      const batch = uniqueHashes.slice(start, start + batchSize);
      
      // Build batch query with placeholders
      const placeholders = batch.map((_, i) => `:hash${i}`).join(", ");
      
      const result = await params.db.execute(
        `SELECT hash, embedding FROM ${tableName}
         WHERE provider = :provider 
           AND model = :model 
           AND provider_key = :providerKey 
           AND hash IN (${placeholders})`,
        {
          provider: identity.provider,
          model: identity.model,
          providerKey: identity.providerKey,
          ...Object.fromEntries(batch.map((h, i) => [`hash${i}`, h]))
        }
      );

      // Parse results and store in Map
      if (result.rows) {
        for (const row of result.rows) {
          const [hash, embeddingClob] = row as [string, string];
          if (!out.has(hash)) {
            try {
              // Parse embedding from CLOB (stored as JSON)
              const embedding = parseEmbedding(embeddingClob);
              if (embedding && embedding.length > 0) {
                out.set(hash, embedding);
              }
            } catch (error) {
              console.warn(`Failed to parse embedding for hash ${hash}:`, error);
            }
          }
        }
      }
    }
  }

  return out;
}

// ========================================================================
// Cache Upsert - Atomic Insert or Update
// ========================================================================

/**
 * Inserts or updates embedding cache entries
 * 
 * ARCHITECTURE: Atomic upsert using Oracle MERGE.
 * 
 * ORACLE STRATEGY:
 * 1. Uses MERGE for atomic INSERT/UPDATE
 * 2. Updates embedding, dims, and timestamp on conflict
 * 3. All operations are atomic per entry
 * 4. Batch processing for efficiency
 * 
 * CONFLICT HANDLING:
 * - Conflicts on (provider, model, provider_key, hash)
 * - Updates embedding, dims, and updated_at
 * - Maintains data consistency
 */
export async function upsertMemoryEmbeddingCacheAsync(params: {
  db: EmbeddingCacheDb;
  enabled: boolean;
  provider: { id: string; model: string } | null;
  providerKey: string | null;
  entries: Array<{ hash: string; embedding: number[] }>;
  now?: number;
  tableName?: string;
}): Promise<void> {
  const provider = params.provider;
  
  // Early exit if caching is disabled or invalid params
  if (!params.enabled || !provider || !params.providerKey || params.entries.length === 0) {
    return;
  }

  const tableName = params.tableName ?? "memory_embedding_cache";
  const now = params.now ?? Date.now();

  // Use Oracle MERGE for atomic upsert
  const mergeSQL = `
    MERGE INTO ${tableName} target
    USING (SELECT 
             :provider AS provider,
             :model AS model,
             :providerKey AS provider_key,
             :hash AS hash,
             :embedding AS embedding,
             :dims AS dims,
             :updatedAt AS updated_at
           FROM DUAL) source
    ON (target.provider = source.provider 
        AND target.model = source.model 
        AND target.provider_key = source.provider_key 
        AND target.hash = source.hash)
    WHEN MATCHED THEN
      UPDATE SET 
        target.embedding = source.embedding,
        target.dims = source.dims,
        target.updated_at = source.updated_at
    WHEN NOT MATCHED THEN
      INSERT (provider, model, provider_key, hash, embedding, dims, updated_at)
      VALUES (source.provider, source.model, source.provider_key, 
              source.hash, source.embedding, source.dims, source.updated_at)
  `;

  // Prepare statement once for all entries
  const stmt = await params.db.prepare(mergeSQL);

  try {
    // Process each entry
    for (const entry of params.entries) {
      const embedding = entry.embedding ?? [];
      await stmt.execute({
        provider: provider.id,
        model: provider.model,
        providerKey: params.providerKey,
        hash: entry.hash,
        embedding: JSON.stringify(embedding),
        dims: embedding.length,
        updatedAt: now
      });
    }
  } finally {
    await stmt.close();
  }
}

// ========================================================================
// Cache Collection - Identify Missing Embeddings
// ========================================================================

/**
 * Collects embeddings from cache and identifies missing ones
 * 
 * ARCHITECTURE: Two-pass collection for efficiency.
 * 
 * ALGORITHM:
 * 1. Iterate through chunks once
 * 2. If embedding is in cache, use it
 * 3. If embedding is missing, add to missing list
 * 4. Maintains original order for embeddings array
 * 
 * USE CASE: This is used to batch-generate missing embeddings
 * before saving them back to cache.
 */
export function collectMemoryCachedEmbeddings<T extends Pick<MemoryChunk, "hash">>(params: {
  chunks: T[];
  cached: Map<string, number[]>;
}): {
  embeddings: number[][];
  missing: Array<{ index: number; chunk: T }>;
} {
  // Pre-allocate embeddings array with empty arrays
  const embeddings: number[][] = Array.from({ length: params.chunks.length }, () => []);
  const missing: Array<{ index: number; chunk: T }> = [];

  // Single pass through chunks
  for (let index = 0; index < params.chunks.length; index += 1) {
    const chunk = params.chunks[index];
    if (!chunk) continue;

    // Try to get embedding from cache
    const hit = chunk.hash ? params.cached.get(chunk.hash) : undefined;
    
    if (hit && hit.length > 0) {
      // Cache hit - use cached embedding
      embeddings[index] = hit;
    } else {
      // Cache miss - mark for generation
      missing.push({ index, chunk });
    }
  }

  return { embeddings, missing };
}

// ========================================================================
// Optimized Version with Batch Operations
// ========================================================================

/**
 * Optimized version with batch operations for better performance
 * 
 * ARCHITECTURE: Uses Oracle's FORALL for bulk operations.
 * 
 * PERFORMANCE IMPROVEMENTS:
 * 1. Binds multiple entries in a single MERGE
 * 2. Uses FORALL for bulk DML
 * 3. Reduces round trips to database
 * 4. Better for large batch sizes (>100 entries)
 */
export async function upsertMemoryEmbeddingCacheBulkAsync(params: {
  db: EmbeddingCacheDb;
  enabled: boolean;
  provider: { id: string; model: string } | null;
  providerKey: string | null;
  entries: Array<{ hash: string; embedding: number[] }>;
  now?: number;
  tableName?: string;
}): Promise<void> {
  const provider = params.provider;
  
  if (!params.enabled || !provider || !params.providerKey || params.entries.length === 0) {
    return;
  }

  const tableName = params.tableName ?? "memory_embedding_cache";
  const now = params.now ?? Date.now();

  // Use PL/SQL block with FORALL for bulk operations
  const bulkSQL = `
    BEGIN
      FORALL i IN 1..:count
        MERGE INTO ${tableName} target
        USING (SELECT 
                 :provider AS provider,
                 :model AS model,
                 :providerKey AS provider_key,
                 :hash(i) AS hash,
                 :embedding(i) AS embedding,
                 :dims(i) AS dims,
                 :updatedAt AS updated_at
               FROM DUAL) source
        ON (target.provider = source.provider 
            AND target.model = source.model 
            AND target.provider_key = source.provider_key 
            AND target.hash = source.hash)
        WHEN MATCHED THEN
          UPDATE SET 
            target.embedding = source.embedding,
            target.dims = source.dims,
            target.updated_at = source.updated_at
        WHEN NOT MATCHED THEN
          INSERT (provider, model, provider_key, hash, embedding, dims, updated_at)
          VALUES (source.provider, source.model, source.provider_key, 
                  source.hash, source.embedding, source.dims, source.updated_at);
    END;
  `;

  const count = params.entries.length;
  const hashes: string[] = [];
  const embeddings: string[] = [];
  const dims: number[] = [];

  for (const entry of params.entries) {
    const embedding = entry.embedding ?? [];
    hashes.push(entry.hash);
    embeddings.push(JSON.stringify(embedding));
    dims.push(embedding.length);
  }

  await params.db.execute(bulkSQL, {
    count,
    provider: provider.id,
    model: provider.model,
    providerKey: params.providerKey,
    hash: hashes,
    embedding: embeddings,
    dims: dims,
    updatedAt: now
  });
}

// ========================================================================
// Cache Cleanup - Remove Stale Entries
// ========================================================================

/**
 * Cleans up old cache entries to prevent unlimited growth
 * 
 * ARCHITECTURE: Periodic cleanup based on age.
 * 
 * STRATEGY:
 * 1. Keeps entries younger than maxAgeDays
 * 2. Keeps at least minEntries even if older
 * 3. Runs as scheduled job or manual trigger
 * 4. Prevents database bloat
 */
export async function cleanupMemoryEmbeddingCacheAsync(params: {
  db: EmbeddingCacheDb;
  maxAgeDays?: number;
  minEntries?: number;
  tableName?: string;
}): Promise<number> {
  const maxAgeDays = params.maxAgeDays ?? 30;
  const minEntries = params.minEntries ?? 1000;
  const tableName = params.tableName ?? "memory_embedding_cache";

  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

  // Count entries to keep
  const countResult = await params.db.execute(
    `SELECT COUNT(*) as cnt FROM ${tableName} WHERE updated_at > :cutoff`,
    { cutoff }
  );

  const keepCount = (countResult.rows?.[0]?.[0] as number) ?? 0;
  
  if (keepCount >= minEntries) {
    // Delete old entries
    const result = await params.db.execute(
      `DELETE FROM ${tableName} WHERE updated_at <= :cutoff`,
      { cutoff }
    );
    return result.rowsAffected ?? 0;
  }

  // Keep at least minEntries, delete oldest beyond that
  const result = await params.db.execute(
    `DELETE FROM ${tableName} 
     WHERE ROWID IN (
       SELECT ROWID FROM ${tableName} 
       WHERE updated_at <= :cutoff
       ORDER BY updated_at
       OFFSET :keepOffset
     )`,
    { cutoff, keepOffset: minEntries - keepCount }
  );

  return result.rowsAffected ?? 0;
}

// ========================================================================
// Cache Statistics - Monitoring
// ========================================================================

/**
 * Gets cache statistics for monitoring
 * 
 * ARCHITECTURE: Provides visibility into cache performance.
 * 
 * METRICS:
 * - Total entries
 * - Entries by provider
 * - Average age
 * - Cache hit ratio (requires hits/misses tracking)
 */
export async function getMemoryEmbeddingCacheStatsAsync(params: {
  db: EmbeddingCacheDb;
  tableName?: string;
}): Promise<{
  totalEntries: number;
  entriesByProvider: Record<string, number>;
  avgAgeHours: number;
  oldestEntryHours: number;
}> {
  const tableName = params.tableName ?? "memory_embedding_cache";

  // Get total count
  const countResult = await params.db.execute(
    `SELECT COUNT(*) as cnt FROM ${tableName}`
  );
  const totalEntries = (countResult.rows?.[0]?.[0] as number) ?? 0;

  // Get counts by provider/model
  const providerResult = await params.db.execute(
    `SELECT provider, model, COUNT(*) as cnt 
     FROM ${tableName} 
     GROUP BY provider, model 
     ORDER BY cnt DESC`
  );

  const entriesByProvider: Record<string, number> = {};
  for (const row of providerResult.rows || []) {
    const [provider, model, count] = row as [string, string, number];
    entriesByProvider[`${provider}/${model}`] = count;
  }

  // Get age statistics
  const ageResult = await params.db.execute(
    `SELECT 
       AVG(EXTRACT(HOUR FROM (SYSTIMESTAMP - updated_at))) as avg_age,
       MIN(EXTRACT(HOUR FROM (SYSTIMESTAMP - updated_at))) as min_age,
       MAX(EXTRACT(HOUR FROM (SYSTIMESTAMP - updated_at))) as max_age
     FROM ${tableName}`
  );

  const row = ageResult.rows?.[0] as [number, number, number] | undefined;
  const avgAgeHours = row?.[0] ?? 0;
  const oldestEntryHours = row?.[2] ?? 0;

  return {
    totalEntries,
    entriesByProvider,
    avgAgeHours,
    oldestEntryHours
  };
}

// ========================================================================
// Module Export
// ========================================================================

export default {
  loadMemoryEmbeddingCacheAsync,
  upsertMemoryEmbeddingCacheAsync,
  upsertMemoryEmbeddingCacheBulkAsync,
  cleanupMemoryEmbeddingCacheAsync,
  getMemoryEmbeddingCacheStatsAsync,
  collectMemoryCachedEmbeddings,
  parseEmbedding,
};