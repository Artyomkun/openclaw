/**
 * Memory Core Plugin - Oracle Source State Module
 * 
 * Oracle-only source file state management for memory index.
 * 
 * RESPONSIBILITIES:
 * - Load file states from Oracle
 * - Resolve file hashes
 * - Track file metadata (path, hash, mtime, size)
 * - Source-specific state management
 * 
 * ORACLE ONLY - No SQLite compatibility.
 * 
 * ORACLE ADAPTATIONS:
 * - Uses Oracle SQL syntax
 * - Async/await for all database operations
 * - Oracle-specific error handling
 * - MERGE for upsert operations
 */

import type { MemorySource } from "openclaw/plugin-sdk/memory-core-host-engine-storage";

// ========================================================================
// Types
// ========================================================================

/**
 * File state row from Oracle.
 */
export type MemorySourceFileStateRow = {
  path: string;
  hash: string;
  mtime?: number;
  size?: number;
};

/**
 * File state with additional Oracle metadata.
 */
export interface OracleSourceFileStateRow extends MemorySourceFileStateRow {
  /** Oracle ROWID for efficient updates */
  rowid?: string;
  /** Oracle timestamp */
  updatedAt?: Date;
}

/**
 * Source state with Oracle-specific info.
 */
export interface OracleSourceState {
  rows: OracleSourceFileStateRow[];
  hashes: Map<string, string>;
  totalFiles: number;
  indexedFiles: number;
  source: MemorySource;
}

// ========================================================================
// SQL Constants - Oracle Only
// ========================================================================

/**
 * Oracle SQL for loading file states.
 */
export const ORACLE_SOURCE_FILE_STATE_SQL = `
  SELECT path, hash, mtime, size, ROWID as rowid, updated_at as updatedAt 
  FROM memory_index_sources 
  WHERE source = :source
`;

/**
 * Oracle SQL for getting file hash.
 */
export const ORACLE_SOURCE_FILE_HASH_SQL = `
  SELECT hash FROM memory_index_sources 
  WHERE path = :path AND source = :source
`;

/**
 * Oracle SQL for checking file existence.
 */
export const ORACLE_SOURCE_FILE_EXISTS_SQL = `
  SELECT COUNT(*) as cnt FROM memory_index_sources 
  WHERE path = :path AND source = :source
`;

/**
 * Oracle SQL for upserting file state.
 */
export const ORACLE_SOURCE_FILE_UPSERT_SQL = `
  MERGE INTO memory_index_sources target
  USING (
    SELECT 
      :path AS path,
      :source AS source,
      :hash AS hash,
      :mtime AS mtime,
      :size AS size
    FROM DUAL
  ) source
  ON (target.path = source.path AND target.source = source.source)
  WHEN MATCHED THEN
    UPDATE SET 
      target.hash = source.hash,
      target.mtime = source.mtime,
      target.size = source.size,
      target.updated_at = SYSTIMESTAMP
  WHEN NOT MATCHED THEN
    INSERT (path, source, hash, mtime, size, updated_at)
    VALUES (
      source.path, 
      source.source, 
      source.hash, 
      source.mtime, 
      source.size, 
      SYSTIMESTAMP
    )
`;

/**
 * Oracle SQL for deleting file state.
 */
export const ORACLE_SOURCE_FILE_DELETE_SQL = `
  DELETE FROM memory_index_sources 
  WHERE path = :path AND source = :source
`;

/**
 * Oracle SQL for source statistics.
 */
export const ORACLE_SOURCE_STATS_SQL = `
  SELECT 
    COUNT(*) as total_files,
    SUM(size) as total_size,
    MIN(mtime) as oldest_mtime,
    MAX(mtime) as newest_mtime
  FROM memory_index_sources 
  WHERE source = :source
`;

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Loads file state from Oracle.
 * 
 * @param params - Load parameters
 * @param params.db - Oracle connection
 * @param params.source - Source to load
 * @param params.includeRowid - Whether to include ROWID
 * @returns File states and hashes
 * 
 * @example
 * ```typescript
 * const { rows, hashes } = await loadMemorySourceFileState({
 *   db: oracleConnection,
 *   source: 'memory',
 *   includeRowid: true
 * });
 * ```
 */
export async function loadMemorySourceFileState(params: {
  db: any;
  source: MemorySource;
  includeRowid?: boolean;
}): Promise<{
  rows: OracleSourceFileStateRow[];
  hashes: Map<string, string>;
}> {
  const sql = params.includeRowid 
    ? ORACLE_SOURCE_FILE_STATE_SQL 
    : ORACLE_SOURCE_FILE_STATE_SQL.replace(', ROWID as rowid, updated_at as updatedAt', '');
  
  try {
    const result = await params.db.execute(sql, { source: params.source });
    const rows: OracleSourceFileStateRow[] = [];
    
    if (result.rows) {
      for (const row of result.rows) {
        const fileState: OracleSourceFileStateRow = {
          path: row[0],
          hash: row[1],
          mtime: row[2],
          size: row[3],
        };
        
        if (params.includeRowid) {
          fileState.rowid = row[4];
          fileState.updatedAt = row[5];
        }
        
        rows.push(fileState);
      }
    }
    
    return {
      rows,
      hashes: new Map(rows.map((row) => [row.path, row.hash])),
    };
  } catch (error) {
    console.error(`Failed to load file state for source ${params.source}:`, error);
    throw error;
  }
}

/**
 * Resolves existing hash for a file from Oracle.
 * 
 * @param params - Resolve parameters
 * @param params.db - Oracle connection
 * @param params.source - Source
 * @param params.path - File path
 * @param params.existingHashes - Optional preloaded hashes
 * @returns Hash or undefined
 * 
 * @example
 * ```typescript
 * const hash = await resolveMemorySourceExistingHash({
 *   db: oracleConnection,
 *   source: 'memory',
 *   path: '/path/to/file.md'
 * });
 * ```
 */
export async function resolveMemorySourceExistingHash(params: {
  db: any;
  source: MemorySource;
  path: string;
  existingHashes?: Map<string, string> | null;
}): Promise<string | undefined> {
  if (params.existingHashes) {
    return params.existingHashes.get(params.path);
  }
  
  try {
    const result = await params.db.execute(ORACLE_SOURCE_FILE_HASH_SQL, {
      path: params.path,
      source: params.source,
    });
    
    return result.rows?.[0]?.[0] as string;
  } catch (error) {
    console.error(`Failed to get hash for ${params.path}:`, error);
    return undefined;
  }
}

/**
 * Checks if file exists in Oracle.
 * 
 * @param params - Check parameters
 * @param params.db - Oracle connection
 * @param params.source - Source
 * @param params.path - File path
 * @returns True if file exists
 * 
 * @example
 * ```typescript
 * const exists = await sourceFileExists({
 *   db: oracleConnection,
 *   source: 'memory',
 *   path: '/path/to/file.md'
 * });
 * ```
 */
export async function sourceFileExists(params: {
  db: any;
  source: MemorySource;
  path: string;
}): Promise<boolean> {
  try {
    const result = await params.db.execute(ORACLE_SOURCE_FILE_EXISTS_SQL, {
      path: params.path,
      source: params.source,
    });
    
    return (result.rows?.[0]?.[0] as number) > 0;
  } catch (error) {
    console.error(`Failed to check file existence for ${params.path}:`, error);
    return false;
  }
}

/**
 * Upserts file state in Oracle.
 * 
 * Uses Oracle MERGE for atomic insert or update.
 * 
 * @param params - Upsert parameters
 * @param params.db - Oracle connection
 * @param params.source - Source
 * @param params.path - File path
 * @param params.hash - File hash
 * @param params.mtime - Last modified time
 * @param params.size - File size
 * @returns Success status
 * 
 * @example
 * ```typescript
 * await upsertSourceFileState({
 *   db: oracleConnection,
 *   source: 'memory',
 *   path: '/path/to/file.md',
 *   hash: 'abc123',
 *   mtime: 1234567890,
 *   size: 1024
 * });
 * ```
 */
export async function upsertSourceFileState(params: {
  db: any;
  source: MemorySource;
  path: string;
  hash: string;
  mtime: number;
  size: number;
}): Promise<boolean> {
  try {
    await params.db.execute(ORACLE_SOURCE_FILE_UPSERT_SQL, {
      path: params.path,
      source: params.source,
      hash: params.hash,
      mtime: params.mtime,
      size: params.size,
    });
    return true;
  } catch (error) {
    console.error(`Failed to upsert file state for ${params.path}:`, error);
    throw error;
  }
}

/**
 * Deletes file state from Oracle.
 * 
 * @param params - Delete parameters
 * @param params.db - Oracle connection
 * @param params.source - Source
 * @param params.path - File path
 * @returns Success status
 * 
 * @example
 * ```typescript
 * await deleteSourceFileState({
 *   db: oracleConnection,
 *   source: 'memory',
 *   path: '/path/to/file.md'
 * });
 * ```
 */
export async function deleteSourceFileState(params: {
  db: any;
  source: MemorySource;
  path: string;
}): Promise<boolean> {
  try {
    const result = await params.db.execute(ORACLE_SOURCE_FILE_DELETE_SQL, {
      path: params.path,
      source: params.source,
    });
    return (result.rowsAffected ?? 0) > 0;
  } catch (error) {
    console.error(`Failed to delete file state for ${params.path}:`, error);
    throw error;
  }
}

/**
 * Gets source statistics from Oracle.
 * 
 * @param params - Statistics parameters
 * @param params.db - Oracle connection
 * @param params.source - Source
 * @returns Source statistics
 * 
 * @example
 * ```typescript
 * const stats = await getSourceStats({
 *   db: oracleConnection,
 *   source: 'memory'
 * });
 * ```
 */
export async function getSourceStats(params: {
  db: any;
  source: MemorySource;
}): Promise<{
  totalFiles: number;
  totalSize: number;
  oldestMtime: number;
  newestMtime: number;
}> {
  try {
    const result = await params.db.execute(ORACLE_SOURCE_STATS_SQL, {
      source: params.source,
    });
    
    const row = result.rows?.[0];
    
    return {
      totalFiles: row?.[0] ?? 0,
      totalSize: row?.[1] ?? 0,
      oldestMtime: row?.[2] ?? 0,
      newestMtime: row?.[3] ?? 0,
    };
  } catch (error) {
    console.error(`Failed to get stats for source ${params.source}:`, error);
    return {
      totalFiles: 0,
      totalSize: 0,
      oldestMtime: 0,
      newestMtime: 0,
    };
  }
}

/**
 * Gets complete source state with all info.
 * 
 * @param params - Source state parameters
 * @param params.db - Oracle connection
 * @param params.source - Source
 * @param params.includeStats - Whether to include statistics
 * @param params.includeRowid - Whether to include ROWID
 * @returns Complete source state
 * 
 * @example
 * ```typescript
 * const state = await getSourceState({
 *   db: oracleConnection,
 *   source: 'memory',
 *   includeStats: true,
 *   includeRowid: true
 * });
 * ```
 */
export async function getSourceState(params: {
  db: any;
  source: MemorySource;
  includeStats?: boolean;
  includeRowid?: boolean;
}): Promise<OracleSourceState> {
  // Load file states
  const { rows, hashes } = await loadMemorySourceFileState({
    db: params.db,
    source: params.source,
    includeRowid: params.includeRowid,
  });
  
  const result: OracleSourceState = {
    rows,
    hashes,
    totalFiles: rows.length,
    indexedFiles: rows.length,
    source: params.source,
  };
  
  // Include statistics if requested
  if (params.includeStats) {
    const stats = await getSourceStats({
      db: params.db,
      source: params.source,
    });
    result.totalFiles = stats.totalFiles;
  }
  
  return result;
}

// ========================================================================
// Batch Operations
// ========================================================================

/**
 * Batch upsert for multiple file states.
 * 
 * Uses Oracle FORALL for bulk operations.
 * 
 * @param params - Batch upsert parameters
 * @param params.db - Oracle connection
 * @param params.source - Source
 * @param params.files - Array of file states
 * @returns Number of upserted files
 * 
 * @example
 * ```typescript
 * const count = await batchUpsertSourceFiles({
 *   db: oracleConnection,
 *   source: 'memory',
 *   files: [
 *     { path: '/a.md', hash: 'abc', mtime: 123, size: 100 },
 *     { path: '/b.md', hash: 'def', mtime: 456, size: 200 }
 *   ]
 * });
 * ```
 */
export async function batchUpsertSourceFiles(params: {
  db: any;
  source: MemorySource;
  files: Array<{ path: string; hash: string; mtime: number; size: number }>;
}): Promise<number> {
  if (params.files.length === 0) {
    return 0;
  }
  
  // Prepare batch data
  const paths: string[] = [];
  const hashes: string[] = [];
  const mtimes: number[] = [];
  const sizes: number[] = [];
  
  for (const file of params.files) {
    paths.push(file.path);
    hashes.push(file.hash);
    mtimes.push(file.mtime);
    sizes.push(file.size);
  }
  
  try {
    // Use PL/SQL block with FORALL for bulk operation
    await params.db.execute(`
      BEGIN
        FORALL i IN 1..:count
          MERGE INTO memory_index_sources target
          USING (
            SELECT 
              :path(i) AS path,
              :source AS source,
              :hash(i) AS hash,
              :mtime(i) AS mtime,
              :size(i) AS size
            FROM DUAL
          ) source
          ON (target.path = source.path AND target.source = source.source)
          WHEN MATCHED THEN
            UPDATE SET 
              target.hash = source.hash,
              target.mtime = source.mtime,
              target.size = source.size,
              target.updated_at = SYSTIMESTAMP
          WHEN NOT MATCHED THEN
            INSERT (path, source, hash, mtime, size, updated_at)
            VALUES (
              source.path, 
              source.source, 
              source.hash, 
              source.mtime, 
              source.size, 
              SYSTIMESTAMP
            );
      END;
    `, {
      count: params.files.length,
      source: params.source,
      path: paths,
      hash: hashes,
      mtime: mtimes,
      size: sizes,
    });
    
    return params.files.length;
  } catch (error) {
    console.error(`Failed to batch upsert files for source ${params.source}:`, error);
    throw error;
  }
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  loadMemorySourceFileState,
  resolveMemorySourceExistingHash,
  sourceFileExists,
  upsertSourceFileState,
  deleteSourceFileState,
  getSourceStats,
  getSourceState,
  
  // Batch
  batchUpsertSourceFiles
};