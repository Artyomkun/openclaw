/**
 * Memory Core Plugin - Oracle FTS State Module
 * 
 * Oracle-only FTS (Full-Text Search) state management.
 * NO ERROR SWALLOWING!
 */

import type { MemorySource } from "openclaw/plugin-sdk/memory-core-host-engine-storage";

// ========================================================================
// Types
// ========================================================================

export interface OracleFTSConfig {
  indexName?: string;
  syncIntervalSeconds?: number;
  useOracleText?: boolean;
  /** Log errors instead of swallowing them */
  logErrors?: boolean;
  /** Throw errors on sync failure */
  throwOnSyncError?: boolean;
}

export interface OracleFTSStatus {
  available: boolean;
  rowCount: number;
  indexSize: number;
  lastSync?: Date;
  error?: string;
}

// ========================================================================
// Constants
// ========================================================================

const DEFAULT_FTS_TABLE = "memory_index_chunks_fts";
const DEFAULT_INDEX_NAME = "memory_fts_idx";

// ========================================================================
// Custom Errors
// ========================================================================

export class FTSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'FTSError';
  }
}

export class FTSSyncError extends FTSError {
  constructor(
    message: string,
    public readonly indexName: string,
    cause?: unknown
  ) {
    super(`FTS sync failed for index ${indexName}: ${message}`, 'FTS_SYNC_ERROR', cause);
    this.name = 'FTSSyncError';
  }
}

export class FTSDeleteError extends FTSError {
  constructor(
    message: string,
    public readonly path?: string,
    public readonly source?: string,
    cause?: unknown
  ) {
    super(`FTS delete failed: ${message}`, 'FTS_DELETE_ERROR', cause);
    this.name = 'FTSDeleteError';
  }
}

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Deletes FTS rows by path and source.
 * 
 * @param params - Delete parameters
 * @param params.db - Oracle connection
 * @param params.tableName - FTS table name
 * @param params.path - File path
 * @param params.source - Source type
 * @param params.currentModel - Current model (optional)
 * @param params.config - FTS configuration
 * @returns Deleted count
 * @throws FTSError on failure
 * 
 * @example
 * ```typescript
 * try {
 *   const { deletedCount } = await deleteMemoryFtsRows({
 *     db: oracleConnection,
 *     path: '/path/to/file.md',
 *     source: 'memory'
 *   });
 * } catch (error) {
 *   console.error('FTS delete failed:', error);
 * }
 * ```
 */
export async function deleteMemoryFtsRows(params: {
  db: any;
  tableName?: string;
  path: string;
  source: MemorySource;
  currentModel?: string;
  config?: OracleFTSConfig;
}): Promise<{ deletedCount: number }> {
  const tableName = params.tableName ?? DEFAULT_FTS_TABLE;
  const config = params.config ?? { logErrors: true, throwOnSyncError: false };

  try {
    // Delete rows
    const result = await params.db.execute(
      `DELETE FROM ${tableName} WHERE path = :path AND source = :source`,
      {
        path: params.path,
        source: params.source,
      }
    );

    const deletedCount = result.rowsAffected ?? 0;

    // Sync Oracle Text index
    try {
      await params.db.execute(
        `BEGIN
           CTX_DDL.SYNC_INDEX(:indexName);
         END;`,
        { indexName: DEFAULT_INDEX_NAME }
      );
    } catch (syncError) {
      const errorMsg = syncError instanceof Error ? syncError.message : String(syncError);
      
      if (config.logErrors !== false) {
        console.error(`FTS sync failed for ${params.path}:`, errorMsg);
      }
      
      if (config.throwOnSyncError) {
        throw new FTSSyncError(errorMsg, DEFAULT_INDEX_NAME, syncError);
      }
      return {
        deletedCount,
      };
    }

    return { deletedCount };
    
  } catch (error) {
    if (error instanceof FTSSyncError || error instanceof FTSError) {
      throw error;
    }
    
    throw new FTSDeleteError(
      `Failed to delete FTS rows for ${params.path}`,
      params.path,
      params.source,
      error
    );
  }
}

/**
 * Inserts FTS row with proper error handling.
 * 
 * @param params - Insert parameters
 * @param params.db - Oracle connection
 * @param params.tableName - FTS table name
 * @param params.id - Row ID
 * @param params.path - File path
 * @param params.source - Source type
 * @param params.model - Model name
 * @param params.text - Text content
 * @param params.startLine - Starting line
 * @param params.endLine - Ending line
 * @param params.config - FTS configuration
 * @returns Insert success
 * @throws FTSError on failure
 * 
 * @example
 * ```typescript
 * try {
 *   await insertMemoryFtsRow({
 *     db: oracleConnection,
 *     id: 'chunk-123',
 *     path: '/path/to/file.md',
 *     source: 'memory',
 *     model: 'text-embedding-3-small',
 *     text: 'Hello world',
 *     startLine: 1,
 *     endLine: 10
 *   });
 * } catch (error) {
 *   console.error('FTS insert failed:', error);
 * }
 * ```
 */
export async function insertMemoryFtsRow(params: {
  db: any;
  tableName?: string;
  id: string;
  path: string;
  source: MemorySource;
  model: string;
  text: string;
  startLine: number;
  endLine: number;
  config?: OracleFTSConfig;
}): Promise<{ inserted: boolean }> {
  const tableName = params.tableName ?? DEFAULT_FTS_TABLE;
  const config = params.config ?? { logErrors: true, throwOnSyncError: false };

  try {
    // Insert row
    await params.db.execute(
      `INSERT INTO ${tableName} (id, path, source, model, text, start_line, end_line)
       VALUES (:id, :path, :source, :model, :text, :startLine, :endLine)`,
      {
        id: params.id,
        path: params.path,
        source: params.source,
        model: params.model,
        text: params.text,
        startLine: params.startLine,
        endLine: params.endLine,
      }
    );
    
    // Sync Oracle Text index
    try {
      await params.db.execute(
        `BEGIN
           CTX_DDL.SYNC_INDEX(:indexName);
         END;`,
        { indexName: DEFAULT_INDEX_NAME }
      );
    } catch (syncError) {
      const errorMsg = syncError instanceof Error ? syncError.message : String(syncError);
      
      if (config.logErrors !== false) {
        console.error(`FTS sync failed for ${params.id}:`, errorMsg);
      }
      
      if (config.throwOnSyncError) {
        throw new FTSSyncError(errorMsg, DEFAULT_INDEX_NAME, syncError);
      }
    }
    
    return { inserted: true };
    
  } catch (error) {
    if (error instanceof FTSSyncError || error instanceof FTSError) {
      throw error;
    }
    
    throw new FTSError(
      `Failed to insert FTS row: ${params.id}`,
      'FTS_INSERT_ERROR',
      error
    );
  }
}

// ========================================================================
// Cleanup with Error Aggregation
// ========================================================================

/**
 * Deletes all FTS rows with error aggregation.
 * 
 * @param params - Delete parameters
 * @param params.db - Oracle connection
 * @param params.tableName - FTS table name
 * @param params.config - FTS configuration
 * @returns Deleted count and errors
 * 
 * @example
 * ```typescript
 * const { deletedCount, errors } = await deleteAllMemoryFtsRows({
 *   db: oracleConnection
 * });
 * 
 * if (errors.length > 0) {
 *   console.error('Some errors occurred:', errors);
 * }
 * ```
 */
export async function deleteAllMemoryFtsRows(params: {
  db: any;
  tableName?: string;
  config?: OracleFTSConfig;
}): Promise<{ deletedCount: number; errors: Error[] }> {
  const tableName = params.tableName ?? DEFAULT_FTS_TABLE;
  const errors: Error[] = [];
  let deletedCount = 0;

  try {
    const result = await params.db.execute(`DELETE FROM ${tableName}`);
    deletedCount = result.rowsAffected ?? 0;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errors.push(new FTSError(
      `Failed to delete all FTS rows`,
      'FTS_DELETE_ALL_ERROR',
      err
    ));
  }

  // Sync index even if some errors
  if (deletedCount > 0) {
    try {
      await params.db.execute(
        `BEGIN
           CTX_DDL.SYNC_INDEX(:indexName);
         END;`,
        { indexName: DEFAULT_INDEX_NAME }
      );
    } catch (syncError) {
      const err = syncError instanceof Error ? syncError : new Error(String(syncError));
      errors.push(new FTSSyncError(
        `Sync failed after delete all`,
        DEFAULT_INDEX_NAME,
        err
      ));
    }
  }

  return { deletedCount, errors };
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core operations
  deleteMemoryFtsRows,
  insertMemoryFtsRow,
  deleteAllMemoryFtsRows,
  
  // Errors
  FTSError,
  FTSSyncError,
  FTSDeleteError,
};