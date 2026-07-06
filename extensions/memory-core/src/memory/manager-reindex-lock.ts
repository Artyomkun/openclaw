/**
 * Memory Core Plugin - Oracle Reindex Lock Module
 * 
 * Oracle-only distributed lock for reindex operations.
 * Ensures only one process rebuilds the index at a time.
 * 
 * RESPONSIBILITIES:
 * - Acquire exclusive lock for reindex
 * - Release lock after reindex
 * - Handle lock contention
 * - Prevent concurrent reindex operations
 * 
 * ORACLE ADAPTATIONS:
 * - Uses Oracle's DBMS_LOCK for distributed locking
 * - Session-based locks (not file-based)
 * - Automatic lock cleanup on connection drop
 * - Configurable lock timeout
 */

import oracledb from "oracledb";

// ========================================================================
// Types
// ========================================================================

/**
 * Reindex lock handle.
 * 
 * @example
 * ```typescript
 * const lock = await acquireMemoryReindexLock(pool);
 * try {
 *   // Perform reindex
 *   await reindex();
 * } finally {
 *   lock.release();
 * }
 * ```
 */
export type MemoryReindexLockHandle = {
  /** Release the lock */
  release: () => Promise<void>;
  /** Lock session ID */
  sessionId: string;
  /** Lock handle */
  lockHandle: string;
};

/**
 * Lock configuration.
 */
export interface MemoryReindexLockConfig {
  /** Lock name (default: 'MEMORY_REINDEX_LOCK') */
  lockName?: string;
  /** Maximum wait time in seconds (default: 0 = no wait) */
  waitSeconds?: number;
  /** Lock timeout in seconds (default: 300) */
  timeoutSeconds?: number;
  /** Session ID (optional, auto-generated) */
  sessionId?: string;
}

// ========================================================================
// Constants
// ========================================================================

/** Default lock name */
const DEFAULT_LOCK_NAME = 'MEMORY_REINDEX_LOCK';

/** Oracle error codes */
const ORACLE_LOCK_ERRORS = {
  /** Lock already owned */
  ALREADY_OWNED: 4,
  /** Lock acquired */
  ACQUIRED: 0,
  /** Timeout */
  TIMEOUT: 5,
  /** Deadlock */
  DEADLOCK: 2,
} as const;

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Resolves lock name for database path (Oracle compatibility).
 * 
 * @param dbPath - Database path
 * @returns Lock name
 * 
 * @example
 * ```typescript
 * const lockName = resolveMemoryReindexLockPath('/path/to/memory.db');
 * // Returns: 'MEMORY_REINDEX_LOCK_/path/to/memory.db'
 * ```
 */
export function resolveMemoryReindexLockPath(dbPath: string): string {
  // Oracle: use normalized path as lock name suffix
  const normalized = dbPath.replace(/[^a-zA-Z0-9]/g, '_');
  return `MEMORY_REINDEX_LOCK_${normalized}`;
}

/**
 * Checks if error is a lock error.
 * 
 * @param err - Error to check
 * @returns True if lock error
 */
function isLockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  
  const error = err as any;
  
  // Check Oracle lock errors
  if (error.errorNum === 60) {
    return true; // ORA-00060: Deadlock detected
  }
  
  if (error.errorNum === 54) {
    return true; // ORA-00054: Resource busy
  }
  
  if (error.errorNum === 4021) {
    return true; // ORA-04021: Timeout
  }
  
  // Check lock status codes
  if (error.status === ORACLE_LOCK_ERRORS.ALREADY_OWNED) {
    return true;
  }
  
  if (error.status === ORACLE_LOCK_ERRORS.TIMEOUT) {
    return true;
  }
  
  if (error.status === ORACLE_LOCK_ERRORS.DEADLOCK) {
    return true;
  }
  
  // Check error message
  const message = error.message || String(err);
  return /lock|busy|timeout|deadlock|ORA-00060|ORA-00054|ORA-04021/i.test(message);
}

/**
 * Acquires a reindex lock using Oracle DBMS_LOCK.
 * 
 * @param pool - Oracle connection pool
 * @param config - Lock configuration
 * @returns Lock handle or undefined if lock is held
 * 
 * @example
 * ```typescript
 * const lock = await tryAcquireMemoryReindexLock(pool, {
 *   lockName: 'MY_LOCK',
 *   waitSeconds: 0
 * });
 * 
 * if (lock) {
 *   try {
 *     await reindex();
 *   } finally {
 *     await lock.release();
 *   }
 * }
 * ```
 */
export async function tryAcquireMemoryReindexLock(
  pool: oracledb.Pool,
  config?: MemoryReindexLockConfig
): Promise<MemoryReindexLockHandle | undefined> {
  const lockName = config?.lockName ?? DEFAULT_LOCK_NAME;
  const waitSeconds = config?.waitSeconds ?? 0;
  const sessionId = config?.sessionId ?? `SESSION_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  // Use Oracle's DBMS_LOCK for distributed locking
  const conn = await pool.getConnection();
  
  try {
    // Allocate and request lock
    const result = await conn.execute(
      `DECLARE
         v_handle VARCHAR2(128);
         v_status NUMBER;
       BEGIN
         -- Allocate lock handle
         v_status := DBMS_LOCK.ALLOCATE_UNIQUE(:lockName, v_handle);
         IF v_status != 0 THEN
           :lockHandle := NULL;
           :acquired := 0;
           :errorMsg := 'Failed to allocate lock';
           RETURN;
         END IF;
         
         -- Request lock with timeout
         v_status := DBMS_LOCK.REQUEST(
           v_handle,
           :timeout,   -- timeout in seconds
           0,          -- release on commit? no
           TRUE        -- exclusive
         );
         
         IF v_status = 0 THEN
           :lockHandle := v_handle;
           :acquired := 1;
         ELSIF v_status = 4 THEN
           -- Already owned by this session
           :lockHandle := v_handle;
           :acquired := 2;
         ELSIF v_status = 5 THEN
           :lockHandle := NULL;
           :acquired := 0;
           :errorMsg := 'Lock timeout';
         ELSE
           :lockHandle := NULL;
           :acquired := 0;
           :errorMsg := 'Lock request failed with status: ' || v_status;
         END IF;
       END;`,
      {
        lockName,
        timeout: waitSeconds,
        lockHandle: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 128 },
        acquired: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        errorMsg: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
      }
    );
    
    const lockHandle = result.outBinds?.lockHandle as string;
    const acquired = result.outBinds?.acquired as number;
    const errorMsg = result.outBinds?.errorMsg as string;
    
    // Check if lock was acquired
    if (acquired === 0 || !lockHandle) {
      if (isLockError({ status: acquired, message: errorMsg })) {
        return undefined;
      }
      throw new Error(`Failed to acquire lock: ${errorMsg || 'Unknown error'}`);
    }
    
    // Create lock handle
    return {
      sessionId,
      lockHandle,
      release: async () => {
        try {
          const releaseConn = await pool.getConnection();
          try {
            await releaseConn.execute(
              `BEGIN
                 DBMS_LOCK.RELEASE(:lockHandle);
               END;`,
              { lockHandle }
            );
          } finally {
            await releaseConn.close();
          }
        } catch (error) {
          console.error('Failed to release lock:', error);
          throw new Error('Failed to release reindex lock', { cause: error });
        }
      },
    };
  } catch (error) {
    await conn.close();
    
    if (isLockError(error)) {
      return undefined;
    }
    
    throw error;
  }
}

/**
 * Acquires a reindex lock or throws if unavailable.
 * 
 * @param pool - Oracle connection pool
 * @param config - Lock configuration
 * @returns Lock handle
 * @throws Error if lock is held by another session
 * 
 * @example
 * ```typescript
 * const lock = await acquireMemoryReindexLock(pool);
 * try {
 *   await reindex();
 * } finally {
 *   await lock.release();
 * }
 * ```
 */
export async function acquireMemoryReindexLock(
  pool: oracledb.Pool,
  config?: MemoryReindexLockConfig
): Promise<MemoryReindexLockHandle> {
  const lock = await tryAcquireMemoryReindexLock(pool, config);
  
  if (lock) {
    return lock;
  }
  
  throw new Error(
    `Memory reindex lock is held by another session. ` +
    `Lock: ${config?.lockName ?? DEFAULT_LOCK_NAME}. ` +
    `Try again later.`
  );
}

/**
 * Checks if reindex lock is held.
 * 
 * @param pool - Oracle connection pool
 * @param lockName - Lock name
 * @returns True if lock is held
 * 
 * @example
 * ```typescript
 * const isLocked = await isMemoryReindexLocked(pool);
 * if (isLocked) {
 *   console.log('Reindex is running');
 * }
 * ```
 */
export async function isMemoryReindexLocked(
  pool: oracledb.Pool,
  lockName?: string
): Promise<boolean> {
  const name = lockName ?? DEFAULT_LOCK_NAME;
  
  const conn = await pool.getConnection();
  try {
    const result = await conn.execute(
      `BEGIN
         :locked := DBMS_LOCK.IS_LOCKED(:lockName);
       END;`,
      {
        lockName: name,
        locked: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    
    return (result.outBinds?.locked as number) > 0;
  } finally {
    await conn.close();
  }
}

/**
 * Gets lock session info.
 * 
 * @param pool - Oracle connection pool
 * @param lockName - Lock name
 * @returns Session info or undefined
 * 
 * @example
 * ```typescript
 * const info = await getMemoryReindexLockInfo(pool);
 * if (info) {
 *   console.log(`Lock held by session ${info.sessionId}`);
 * }
 * ```
 */
export async function getMemoryReindexLockInfo(
  pool: oracledb.Pool,
  lockName?: string
): Promise<{ sessionId: string; acquiredAt: Date } | undefined> {
  const name = lockName ?? DEFAULT_LOCK_NAME;
  
  const conn = await pool.getConnection();
  try {
    const result = await conn.execute(
      `SELECT 
         userenv('SID') as session_id,
         SYSDATE as acquired_at
       FROM v$lock
       WHERE type = 'UL' 
         AND id1 = (SELECT hash FROM v$dbms_lock WHERE name = :lockName)
         AND block = 1`,
      { lockName: name }
    );
    
    const row = result.rows?.[0];
    if (!row) {
      return undefined;
    }
    
    return {
      sessionId: String(row[0]),
      acquiredAt: row[1] as Date,
    };
  } finally {
    await conn.close();
  }
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  resolveMemoryReindexLockPath,
  tryAcquireMemoryReindexLock,
  acquireMemoryReindexLock,
  
  // Info
  isMemoryReindexLocked,
  getMemoryReindexLockInfo
}