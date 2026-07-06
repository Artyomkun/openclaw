/**
 * Memory Core Plugin - Oracle Session Sync State Module
 * 
 * Pure session synchronization logic - no database coupling.
 * Determines which files need reindexing based on file state.
 * 
 * Responsibilities:
 * 1. Detect dirty files (modified, new, or missing)
 * 2. Plan session sync strategy (full vs incremental)
 * 3. Track active session paths
 * 4. Handle session file states
 * 
 * ORACLE ADAPTATIONS:
 * - Added Oracle-specific timestamp handling (NUMBER for milliseconds)
 * - Compatible with Oracle's DATE/TIMESTAMP types
 * - Added session state persistence helpers
 * - Session file tracking for Oracle
 */

import type { MemorySourceFileStateRow } from "./manager-source-state.ts";

// ========================================================================
// Types
// ========================================================================

/**
 * Session file state from startup scan.
 * 
 * ORACLE ADAPTATION:
 * - mtimeMs stored as NUMBER(19) in Oracle
 * - Size stored as NUMBER(19) in Oracle
 * - Path stored as VARCHAR2(1000)
 */
export type MemorySessionStartupFileState = {
  /** Absolute file path */
  absPath: string;
  /** Relative path for storage */
  path: string;
  /** Last modified timestamp in milliseconds */
  mtimeMs: number;
  /** File size in bytes */
  size: number;
};

/**
 * Session sync plan result.
 * 
 * ORACLE ADAPTATION:
 * - Active paths for Oracle queries (IN clause)
 * - Existing rows from Oracle table
 * - Hashes for quick comparison
 */
export type MemorySessionSyncPlan = {
  /** Active session paths (null = index all) */
  activePaths: Set<string> | null;
  /** Existing rows from Oracle database */
  existingRows: MemorySourceFileStateRow[] | null;
  /** Hash map for quick lookups */
  existingHashes: Map<string, string> | null;
  /** Whether to index all files */
  indexAll: boolean;
};

// ========================================================================
// Dirty File Detection
// ========================================================================

/**
 * Resolves which session files are dirty (need reindexing).
 * 
 * ARCHITECTURE: Detects changes by comparing file state.
 * 
 * DIRTY CRITERIA:
 * 1. File not in index → dirty (new file)
 * 2. File size changed → dirty (content modified)
 * 3. File mtime increased → dirty (file updated)
 * 4. File metadata invalid → dirty (corrupt state)
 * 
 * ORACLE ADAPTATION:
 * - mtime stored as NUMBER(19) milliseconds
 * - Safe numeric comparison
 * - Handles null/undefined values
 * 
 * @param params - File states and existing index rows
 * @returns Array of dirty file absolute paths
 */
export function resolveMemorySessionStartupDirtyFiles(params: {
  /** Files to check */
  files: MemorySessionStartupFileState[];
  /** Existing rows from Oracle database */
  existingRows?: MemorySourceFileStateRow[] | null;
}): string[] {
  // Build index for O(1) lookups
  const indexedRows = new Map((params.existingRows ?? []).map((row) => [row.path, row]));
  const dirtyFiles: string[] = [];

  for (const file of params.files) {
    const existing = indexedRows.get(file.path);
    
    // New file - mark as dirty
    if (!existing) {
      dirtyFiles.push(file.absPath);
      continue;
    }

    // Parse Oracle stored timestamps (NUMBER)
    const indexedMtimeMs = Number(existing.mtime);
    const indexedSize = Number(existing.size);

    // Invalid state - force reindex
    if (!Number.isFinite(indexedMtimeMs) || !Number.isFinite(indexedSize)) {
      dirtyFiles.push(file.absPath);
      continue;
    }

    // File changed - size different or mtime newer
    if (file.size !== indexedSize || file.mtimeMs > indexedMtimeMs) {
      dirtyFiles.push(file.absPath);
    }
  }

  return dirtyFiles;
}

// ========================================================================
// Session Sync Plan
// ========================================================================

/**
 * Resolves the session synchronization plan.
 * 
 * ARCHITECTURE: Determines what and how to sync.
 * 
 * SYNC STRATEGIES:
 * 1. Full Reindex → index everything (force)
 * 2. Target Files → index specific session files
 * 3. Incremental → index only dirty files
 * 4. Dirty Detection → use active paths filter
 * 
 * ORACLE ADAPTATION:
 * - Uses activePaths for Oracle IN clause filtering
 * - ExistingHashes for quick deduplication
 * - Session path function for Oracle path mapping
 * 
 * @param params - Sync configuration
 * @returns Sync plan with active paths and index strategy
 */
export function resolveMemorySessionSyncPlan(params: {
  /** Force full reindex */
  needsFullReindex: boolean;
  /** All available files */
  files: string[];
  /** Target session files (specific sessions) */
  targetSessionFiles: Set<string> | null;
  /** Files marked as dirty */
  sessionsDirtyFiles: Set<string>;
  /** Existing rows from Oracle */
  existingRows?: MemorySourceFileStateRow[] | null;
  /** Function to get session path for file */
  sessionPathForFile: (file: string) => string;
}): MemorySessionSyncPlan {
  // Determine active paths
  const activePaths = params.targetSessionFiles
    ? null // Target files mode - index specific files
    : new Set(params.files.map((file) => params.sessionPathForFile(file)));

  // Existing rows (for dirty detection)
  const existingRows = activePaths === null ? null : (params.existingRows ?? []);

  // Determine if we should index all
  const indexAll =
    params.needsFullReindex ||
    Boolean(params.targetSessionFiles) ||
    params.sessionsDirtyFiles.size === 0;

  return {
    activePaths,
    existingRows,
    existingHashes: existingRows ? new Map(existingRows.map((row) => [row.path, row.hash])) : null,
    indexAll,
  };
}

// ========================================================================
// Oracle-Specific Helpers
// ========================================================================

/**
 * Builds Oracle query for session files.
 * 
 * ORACLE ADAPTATION:
 * - Uses Oracle's TABLE function for array binding
 * - Handles large IN lists with batch processing
 * - Optimized for Oracle's execution plan
 */
export function buildOracleSessionQuery(params: {
  activePaths: Set<string> | null;
  tableName: string;
  columns: string[];
  batchSize?: number;
}): {
  sql: string;
  bindings: Record<string, any>;
} {
  const { activePaths, tableName, columns, batchSize = 1000 } = params;
  
  if (!activePaths || activePaths.size === 0) {
    return {
      sql: `SELECT ${columns.join(', ')} FROM ${tableName} WHERE 1=0`,
      bindings: {},
    };
  }

  const pathArray = Array.from(activePaths);
  const batches = [];
  
  for (let i = 0; i < pathArray.length; i += batchSize) {
    batches.push(pathArray.slice(i, i + batchSize));
  }

  if (batches.length === 1) {
    // Single batch - use IN clause
    const placeholders = batches[0].map((_, i) => `:path${i}`).join(', ');
    return {
      sql: `SELECT ${columns.join(', ')} FROM ${tableName} WHERE path IN (${placeholders})`,
      bindings: Object.fromEntries(batches[0].map((p, i) => [`path${i}`, p])),
    };
  }

  // Multiple batches - use UNION ALL
  const unionQueries = batches.map((batch, idx) => {
    const placeholders = batch.map((_, i) => `:path${idx}_${i}`).join(', ');
    return `SELECT ${columns.join(', ')} FROM ${tableName} WHERE path IN (${placeholders})`;
  });

  return {
    sql: unionQueries.join(' UNION ALL '),
    bindings: Object.fromEntries(
      batches.flatMap((batch, idx) =>
        batch.map((p, i) => [`path${idx}_${i}`, p])
      )
    ),
  };
}

/**
 * Compares file states for Oracle.
 * 
 * ORACLE ADAPTATION:
 * - Converts Oracle DATE to milliseconds
 * - Handles Oracle NUMBER types
 * - Safe null handling
 */
export function compareFileStateForOracle(params: {
  file: MemorySessionStartupFileState;
  oracleRow: MemorySourceFileStateRow;
}): {
  isDirty: boolean;
  reason?: 'newer' | 'size' | 'missing' | 'invalid';
} {
  const { file, oracleRow } = params;

  // Check if row exists
  if (!oracleRow) {
    return { isDirty: true, reason: 'missing' };
  }

  // Parse Oracle values (NUMBER)
  const oracleMtime = Number(oracleRow.mtime);
  const oracleSize = Number(oracleRow.size);

  // Invalid Oracle state
  if (!Number.isFinite(oracleMtime) || !Number.isFinite(oracleSize)) {
    return { isDirty: true, reason: 'invalid' };
  }

  // Size changed
  if (file.size !== oracleSize) {
    return { isDirty: true, reason: 'size' };
  }

  // File modified
  if (file.mtimeMs > oracleMtime) {
    return { isDirty: true, reason: 'newer' };
  }

  return { isDirty: false };
}

/**
 * Builds Oracle MERGE for session state.
 * 
 * ORACLE ADAPTATION:
 * - Atomic upsert with MERGE
 * - Handles session-specific data
 * - Efficient bulk operations
 */
export function buildOracleSessionStateMerge(params: {
  tableName: string;
  sessionId: string;
  path: string;
  hash: string;
  mtime: number;
  size: number;
}): {
  sql: string;
  bindings: Record<string, any>;
} {
  const { tableName, sessionId, path, hash, mtime, size } = params;

  return {
    sql: `
      MERGE INTO ${tableName} target
      USING (
        SELECT 
          :path AS path,
          :sessionId AS session_id,
          :hash AS hash,
          :mtime AS mtime,
          :size AS size,
          SYSTIMESTAMP AS updated_at
        FROM DUAL
      ) source
      ON (target.path = source.path AND target.session_id = source.session_id)
      WHEN MATCHED THEN
        UPDATE SET 
          target.hash = source.hash,
          target.mtime = source.mtime,
          target.size = source.size,
          target.updated_at = source.updated_at
      WHEN NOT MATCHED THEN
        INSERT (path, session_id, hash, mtime, size, updated_at)
        VALUES (
          source.path, 
          source.session_id, 
          source.hash, 
          source.mtime, 
          source.size, 
          source.updated_at
        )
    `,
    bindings: {
      path,
      sessionId,
      hash,
      mtime,
      size,
    },
  };
}

/**
 * Filters session files for Oracle query.
 * 
 * ORACLE ADAPTATION:
 * - Handles Oracle's 1000 item limit for IN clause
 * - Batch processing for large session sets
 * - Optimized for Oracle's SQL parser
 */
export function filterSessionFilesForOracle(params: {
  files: string[];
  sessionPaths: Set<string>;
  batchSize?: number;
}): string[] {
  const { files, sessionPaths, batchSize = 1000 } = params;
  const result: string[] = [];
  const pathArray = Array.from(sessionPaths);

  for (let i = 0; i < pathArray.length; i += batchSize) {
    const batch = new Set(pathArray.slice(i, i + batchSize));
    for (const file of files) {
      if (batch.has(file)) {
        result.push(file);
      }
    }
  }

  return result;
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core functions
  resolveMemorySessionStartupDirtyFiles,
  resolveMemorySessionSyncPlan,
  
  // Oracle-specific helpers
  buildOracleSessionQuery,
  compareFileStateForOracle,
  buildOracleSessionStateMerge,
  filterSessionFilesForOracle,
};