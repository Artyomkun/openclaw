/**
 * Memory Core Plugin - Oracle Status State Module
 * 
 * Oracle-only status management for memory index.
 * 
 * RESPONSIBILITIES:
 * - Status aggregation from Oracle tables
 * - Provider status resolution
 * - Dirty state management
 * - Source statistics
 * - AI Vector Search status
 * - Oracle Text status
 * - Connection pool status
 * 
 * ORACLE ONLY - No SQLite compatibility.
 */

import type { MemorySource } from "openclaw/plugin-sdk/memory-core-host-engine-storage";

// ========================================================================
// Types
// ========================================================================

/**
 * Provider information for status.
 */
type StatusProvider = {
  id: string;
  model: string;
};

/**
 * Oracle status configuration.
 */
export interface OracleStatusConfig {
  /** Check AI Vector Search availability */
  checkAIVector?: boolean;
  /** Check Oracle Text availability */
  checkText?: boolean;
  /** Include connection pool stats */
  includePoolStats?: boolean;
  /** Include Oracle version */
  includeVersion?: boolean;
}

/**
 * Extended Oracle status with additional metrics.
 */
export interface OracleStatus {
  backend: "oracle";
  workspaceDir: string;
  dbPath: string;
  provider: string;
  model?: string;
  sources: MemorySource[];
  files: number;
  chunks: number;
  sourceCounts: Array<{ source: MemorySource; files: number; chunks: number }>;
  dirty: boolean;
  oracle?: {
    version?: string;
    aiVectorAvailable?: boolean;
    textAvailable?: boolean;
    poolStats?: {
      connectionsOpen: number;
      connectionsInUse: number;
    };
    vectorStats?: {
      totalVectors: number;
      uniqueModels: number;
      maxEmbeddingSize: number;
    };
    ftsStats?: {
      totalEntries: number;
      uniqueSources: number;
    };
  };
}

// ========================================================================
// SQL Constants - Oracle Only
// ========================================================================

/**
 * Oracle SQL for status aggregation.
 */
export const ORACLE_STATUS_AGGREGATE_SQL = `
  SELECT 'files' AS kind, source, COUNT(*) as c 
  FROM memory_index_sources 
  WHERE 1=1__FILTER__ 
  GROUP BY source
  UNION ALL
  SELECT 'chunks' AS kind, source, COUNT(*) as c 
  FROM memory_index_chunks 
  WHERE 1=1__FILTER__ 
  GROUP BY source
`;

/**
 * Oracle SQL for vector status.
 */
export const ORACLE_VECTOR_STATUS_SQL = `
  SELECT 
    COUNT(*) as total_vectors,
    COUNT(DISTINCT model) as unique_models,
    MAX(LENGTH(embedding)) as max_embedding_size
  FROM memory_index_chunks_vec
`;

/**
 * Oracle SQL for FTS status.
 */
export const ORACLE_FTS_STATUS_SQL = `
  SELECT 
    COUNT(*) as total_entries,
    COUNT(DISTINCT source) as unique_sources
  FROM memory_index_chunks_fts
`;

/**
 * Oracle SQL for Oracle version.
 */
export const ORACLE_VERSION_SQL = `
  SELECT version FROM v$instance
`;

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Resolves initial memory dirty state.
 * 
 * Determines whether memory index needs synchronization.
 * 
 * @param params - Dirty state parameters
 * @param params.hasMemorySource - Whether memory source exists
 * @param params.statusOnly - Whether this is a status check only
 * @param params.hasIndexedMeta - Whether metadata exists
 * @param params.indexIdentityMismatched - Whether identity mismatched
 * @returns True if memory is dirty
 * 
 * @example
 * ```typescript
 * const isDirty = resolveInitialMemoryDirty({
 *   hasMemorySource: true,
 *   statusOnly: false,
 *   hasIndexedMeta: true,
 *   indexIdentityMismatched: false
 * });
 * // Returns: true
 * ```
 */
export function resolveInitialMemoryDirty(params: {
  hasMemorySource: boolean;
  statusOnly: boolean;
  hasIndexedMeta: boolean;
  indexIdentityMismatched?: boolean;
}): boolean {
  return (
    Boolean(params.indexIdentityMismatched) ||
    (params.hasMemorySource && (params.statusOnly ? !params.hasIndexedMeta : true))
  );
}

/**
 * Resolves provider information for status.
 * 
 * Determines current provider state and search mode.
 * 
 * @param params - Provider parameters
 * @param params.provider - Current provider
 * @param params.providerInitialized - Whether provider is initialized
 * @param params.requestedProvider - Requested provider ID
 * @param params.configuredModel - Configured model name
 * @returns Provider info with search mode
 * 
 * @example
 * ```typescript
 * const info = resolveStatusProviderInfo({
 *   provider: { id: 'openai', model: 'text-embedding-3-small' },
 *   providerInitialized: true,
 *   requestedProvider: 'openai',
 *   configuredModel: 'text-embedding-3-small'
 * });
 * // Returns: { provider: 'openai', model: 'text-embedding-3-small', searchMode: 'hybrid' }
 * ```
 */
export function resolveStatusProviderInfo(params: {
  provider: StatusProvider | null;
  providerInitialized: boolean;
  requestedProvider: string;
  configuredModel?: string;
}): {
  provider: string;
  model?: string;
  searchMode: "hybrid" | "fts-only";
} {
  if (params.provider) {
    return {
      provider: params.provider.id,
      model: params.provider.model,
      searchMode: "hybrid",
    };
  }
  if (params.providerInitialized) {
    return {
      provider: "none",
      model: undefined,
      searchMode: "fts-only",
    };
  }
  return {
    provider: params.requestedProvider,
    model: params.configuredModel || undefined,
    searchMode: "hybrid",
  };
}

/**
 * Collects memory status aggregate from Oracle.
 * 
 * Aggregates file and chunk counts by source.
 * 
 * @param params - Aggregation parameters
 * @param params.db - Oracle connection
 * @param params.sources - Sources to include
 * @param params.sourceFilterSql - Optional SQL filter
 * @param params.sourceFilterParams - Filter parameters
 * @returns Aggregated status
 * 
 * @example
 * ```typescript
 * const status = collectMemoryStatusAggregate({
 *   db: oracleConnection,
 *   sources: ['memory', 'sessions'],
 *   sourceFilterSql: ' AND source IN (:source1, :source2)',
 *   sourceFilterParams: ['memory', 'sessions']
 * });
 * ```
 */
export async function collectMemoryStatusAggregate(params: {
  db: any;
  sources: Iterable<MemorySource>;
  sourceFilterSql?: string;
  sourceFilterParams?: MemorySource[];
}): Promise<{
  files: number;
  chunks: number;
  sourceCounts: Array<{ source: MemorySource; files: number; chunks: number }>;
}> {
  const sources = Array.from(params.sources);
  const bySource = new Map<MemorySource, { files: number; chunks: number }>();
  
  for (const source of sources) {
    bySource.set(source, { files: 0, chunks: 0 });
  }
  
  const sourceFilterSql = params.sourceFilterSql ?? "";
  const sourceFilterParams = params.sourceFilterParams ?? [];
  
  // Build Oracle query with bind parameters
  let sql = ORACLE_STATUS_AGGREGATE_SQL.replace("__FILTER__", sourceFilterSql);
  
  // Execute query
  const result = await params.db.execute(sql, sourceFilterParams);
  
  let files = 0;
  let chunks = 0;
  
  if (result.rows) {
    for (const row of result.rows) {
      const kind = row[0] as string;
      const source = row[1] as MemorySource;
      const count = row[2] as number;
      
      const entry = bySource.get(source) ?? { files: 0, chunks: 0 };
      
      if (kind === "files") {
        entry.files = count;
        files += count;
      } else {
        entry.chunks = count;
        chunks += count;
      }
      
      bySource.set(source, entry);
    }
  }
  
  return {
    files,
    chunks,
    sourceCounts: sources.map((source) => Object.assign({ source }, bySource.get(source)!)),
  };
}

// ========================================================================
// Oracle Status Functions
// ========================================================================

/**
 * Gets Oracle version.
 * 
 * @param db - Oracle connection
 * @returns Oracle version string or undefined
 */
export async function getOracleVersion(db: any): Promise<string | undefined> {
  try {
    const result = await db.execute(ORACLE_VERSION_SQL);
    return result.rows?.[0]?.[0] as string;
  } catch {
    return undefined;
  }
}

/**
 * Gets vector status from Oracle.
 * 
 * @param db - Oracle connection
 * @returns Vector status
 */
export async function getOracleVectorStatus(db: any): Promise<{
  totalVectors: number;
  uniqueModels: number;
  maxEmbeddingSize: number;
}> {
  try {
    const result = await db.execute(ORACLE_VECTOR_STATUS_SQL);
    const row = result.rows?.[0];
    
    return {
      totalVectors: row?.[0] ?? 0,
      uniqueModels: row?.[1] ?? 0,
      maxEmbeddingSize: row?.[2] ?? 0,
    };
  } catch {
    return {
      totalVectors: 0,
      uniqueModels: 0,
      maxEmbeddingSize: 0,
    };
  }
}

/**
 * Gets FTS status from Oracle.
 * 
 * @param db - Oracle connection
 * @returns FTS status
 */
export async function getOracleFTSStatus(db: any): Promise<{
  totalEntries: number;
  uniqueSources: number;
}> {
  try {
    const result = await db.execute(ORACLE_FTS_STATUS_SQL);
    const row = result.rows?.[0];
    
    return {
      totalEntries: row?.[0] ?? 0,
      uniqueSources: row?.[1] ?? 0,
    };
  } catch {
    return {
      totalEntries: 0,
      uniqueSources: 0,
    };
  }
}

/**
 * Gets AI Vector Search availability.
 * 
 * @param db - Oracle connection
 * @returns True if AI Vector Search is available
 */
export async function isOracleAIVectorAvailable(db: any): Promise<boolean> {
  try {
    const result = await db.execute(
      `SELECT COUNT(*) FROM memory_index_chunks_vec WHERE ROWNUM <= 1`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets Oracle Text availability.
 * 
 * @param db - Oracle connection
 * @returns True if Oracle Text is available
 */
export async function isOracleTextAvailable(db: any): Promise<boolean> {
  try {
    const result = await db.execute(
      `SELECT COUNT(*) FROM memory_index_chunks_fts WHERE ROWNUM <= 1`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets connection pool statistics.
 * 
 * @param db - Oracle connection with pool
 * @returns Pool statistics or undefined
 */
export async function getOraclePoolStats(db: any): Promise<{
  connectionsOpen: number;
  connectionsInUse: number;
} | undefined> {
  if (!db.pool) {
    return undefined;
  }
  
  try {
    const stats = await db.pool.getStatistics();
    return {
      connectionsOpen: stats.connectionsOpen || 0,
      connectionsInUse: stats.connectionsInUse || 0,
    };
  } catch {
    return undefined;
  }
}

// ========================================================================
// Main Status Function
// ========================================================================

/**
 * Gets complete Oracle status.
 * 
 * @param params - Status parameters
 * @param params.db - Oracle connection
 * @param params.workspaceDir - Workspace directory
 * @param params.dbPath - Database path
 * @param params.sources - Sources to include
 * @param params.provider - Current provider
 * @param params.providerInitialized - Whether provider is initialized
 * @param params.requestedProvider - Requested provider ID
 * @param params.configuredModel - Configured model name
 * @param params.config - Oracle status configuration
 * @param params.dirty - Whether index is dirty
 * @returns Complete Oracle status
 * 
 * @example
 * ```typescript
 * const status = await getOracleStatus({
 *   db: oracleConnection,
 *   workspaceDir: '/path/to/workspace',
 *   dbPath: '/path/to/db',
 *   sources: ['memory', 'sessions'],
 *   provider: { id: 'openai', model: 'text-embedding-3-small' },
 *   providerInitialized: true,
 *   requestedProvider: 'openai',
 *   configuredModel: 'text-embedding-3-small',
 *   config: {
 *     checkAIVector: true,
 *     checkText: true,
 *     includePoolStats: true,
 *     includeVersion: true
 *   },
 *   dirty: false
 * });
 * ```
 */
export async function getOracleStatus(params: {
  db: any;
  workspaceDir: string;
  dbPath: string;
  sources: Iterable<MemorySource>;
  provider: StatusProvider | null;
  providerInitialized: boolean;
  requestedProvider: string;
  configuredModel?: string;
  config?: OracleStatusConfig;
  dirty?: boolean;
}): Promise<OracleStatus> {
  const config = params.config ?? {};
  
  // Get provider info
  const providerInfo = resolveStatusProviderInfo({
    provider: params.provider,
    providerInitialized: params.providerInitialized,
    requestedProvider: params.requestedProvider,
    configuredModel: params.configuredModel,
  });
  
  // Get aggregate stats
  const aggregate = await collectMemoryStatusAggregate({
    db: params.db,
    sources: params.sources,
  });
  
  // Build base status
  const status: OracleStatus = {
    backend: "oracle",
    workspaceDir: params.workspaceDir,
    dbPath: params.dbPath,
    provider: providerInfo.provider,
    model: providerInfo.model,
    sources: Array.from(params.sources),
    files: aggregate.files,
    chunks: aggregate.chunks,
    sourceCounts: aggregate.sourceCounts,
    dirty: params.dirty ?? false,
  };
  
  // Add Oracle-specific info
  const oracleInfo: any = {};
  
  // Get Oracle version
  if (config.includeVersion) {
    const version = await getOracleVersion(params.db);
    if (version) {
      oracleInfo.version = version;
    }
  }
  
  // Check AI Vector Search
  if (config.checkAIVector) {
    oracleInfo.aiVectorAvailable = await isOracleAIVectorAvailable(params.db);
    
    // Get vector stats
    const vectorStats = await getOracleVectorStatus(params.db);
    if (vectorStats.totalVectors > 0) {
      oracleInfo.vectorStats = vectorStats;
    }
  }
  
  // Check Oracle Text
  if (config.checkText) {
    oracleInfo.textAvailable = await isOracleTextAvailable(params.db);
    
    // Get FTS stats
    const ftsStats = await getOracleFTSStatus(params.db);
    if (ftsStats.totalEntries > 0) {
      oracleInfo.ftsStats = ftsStats;
    }
  }
  
  // Get pool stats
  if (config.includePoolStats) {
    const poolStats = await getOraclePoolStats(params.db);
    if (poolStats) {
      oracleInfo.poolStats = poolStats;
    }
  }
  
  if (Object.keys(oracleInfo).length > 0) {
    status.oracle = oracleInfo;
  }
  
  return status;
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  resolveInitialMemoryDirty,
  resolveStatusProviderInfo,
  collectMemoryStatusAggregate,
  
  // Oracle status
  getOracleStatus,
  getOracleVersion,
  getOracleVectorStatus,
  getOracleFTSStatus,
  isOracleAIVectorAvailable,
  isOracleTextAvailable,
  getOraclePoolStats,
};