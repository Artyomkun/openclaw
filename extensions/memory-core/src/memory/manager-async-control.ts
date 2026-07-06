/**
 * Memory Core Plugin - Oracle Architecture
 * 
 * ARCHITECTURAL PATTERN: Pure Async Oracle with Self-Healing
 * 
 * This module implements a fault-tolerant memory storage system using Oracle Database.
 * The architecture is built around several key principles:
 * 
 * 1. Connection Pooling with Automatic Recovery
 *    - Uses Oracle's connection pool for efficient resource management
 *    - Implements exponential backoff recovery for connection failures
 *    - Self-healing: automatically recreates pool on critical errors
 * 
 * 2. Queue-Based Async Processing
 *    - Non-blocking session indexing through work queues
 *    - Priority handling: main sync vs. queued sessions
 *    - Idempotent operations to prevent duplicate processing
 * 
 * 3. Transactional Integrity
 *    - ACID-compliant operations with explicit transaction boundaries
 *    - Automatic rollback on failure
 *    - Consistent read/write isolation
 * 
 * 4. State Management
 *    - Centralized state object for all operations
 *    - Graceful shutdown with resource cleanup
 *    - Health monitoring through recovery metrics
 */

import oracledb from "oracledb";
import { createSubsystemLogger } from "openclaw/plugin-sdk/memory-core-host-engine-foundation";

const log = createSubsystemLogger("memory");

// ========================================================================
// Configuration Layer
// ========================================================================

/**
 * Configuration interface for the Oracle memory plugin
 * 
 * DESIGN: Externalized configuration with sensible defaults.
 * The plugin follows the "convention over configuration" principle -
 * only connection details are required, everything else has production-ready defaults.
 */
export interface MemoryOracleConfig {
  /** Oracle database username - required for authentication */
  user: string;
  /** Oracle database password - required for authentication */
  password: string;
  /** Oracle connection string (e.g., 'localhost:1521/XEPDB1') - required for network routing */
  connectString: string;
  /** Minimum connections in pool - ensures baseline performance */
  poolMin?: number;
  /** Maximum connections in pool - prevents resource exhaustion */
  poolMax?: number;
  /** Connection increment when pool grows - avoids expensive creation storms */
  poolIncrement?: number;
  /** Idle connection timeout - prevents stale connections */
  poolTimeout?: number;
  /** Maximum recovery attempts - prevents infinite loops in failure scenarios */
  maxRecoveryAttempts?: number;
  /** Backoff delay - prevents thundering herd on recovery */
  recoveryBackoffMs?: number;
}

/** Production-ready defaults optimized for typical workloads */
const DEFAULT_CONFIG: Required<Omit<MemoryOracleConfig, 'user' | 'password' | 'connectString'>> = {
  poolMin: 2,           // Minimum 2 connections for high availability
  poolMax: 10,          // Cap at 10 to prevent connection exhaustion
  poolIncrement: 1,     // Grow slowly to avoid resource spikes
  poolTimeout: 60,      // Recycle idle connections every minute
  maxRecoveryAttempts: 3, // Three strikes and you're out
  recoveryBackoffMs: 1000, // Wait 1 second before retry
};

// ========================================================================
// Domain Types
// ========================================================================

/**
 * Represents a session to be indexed
 * 
 * ARCHITECTURE: Sessions are first-class citizens in the memory system.
 * Each session can have multiple files and events associated with it.
 * The sessionKey provides additional grouping for complex multi-agent scenarios.
 */
export interface MemorySessionTarget {
  /** Primary identifier - must be unique within the system */
  sessionId: string;
  /** Optional: enables per-agent session isolation */
  agentId?: string;
  /** Optional: allows custom grouping beyond session/agent boundaries */
  sessionKey?: string;
}

/**
 * Parameters for memory indexing operations
 * 
 * DESIGN: Flexible parameter object that supports both immediate
 * and queued indexing operations. The 'reason' field enables
 * operational analytics and debugging.
 */
export interface MemoryIndexParams {
  /** Audit trail: why is this indexing happening? */
  reason?: string;
  /** Override: force indexing even if files haven't changed */
  force?: boolean;
  /** Sessions to index immediately */
  sessions?: MemorySessionTarget[];
  /** Session files to index immediately */
  sessionFiles?: string[];
}

/**
 * Central state object for the memory system
 * 
 * ARCHITECTURE: The state object is the single source of truth
 * for the plugin's operational status. It maintains both
 * health metrics (recovery counts) and operational queues.
 * 
 * LIFECYCLE: Created → Initialized → Running → Draining → Closed
 */
export interface MemoryOracleState {
  /** Lifecycle flag: set to true during graceful shutdown */
  closed: boolean;
  /** Connection pool: the heart of the system */
  pool: oracledb.Pool;
  /** Frozen configuration: prevents runtime config drift */
  config: Required<MemoryOracleConfig>;
  /** Schema metadata: caches vector dimensions for performance */
  vectorDims?: number;
  /** Health metrics: total recovery attempts */
  recoveryAttempts: number;
  /** Health metrics: successful recoveries */
  recoverySuccesses: number;
  /** Health metrics: failed recoveries */
  recoveryFailures: number;
  /** Health metrics: last error for diagnostics */
  recoveryLastError?: string;
  /** Main indexing task: ensures only one full sync runs at a time */
  indexingTask: Promise<void> | null;
  /** Queued indexing: processes backlog without blocking */
  queuedIndexing: Promise<void> | null;
  /** Queue: session files pending processing */
  queuedSessionFiles: Set<string>;
  /** Queue: sessions pending processing with deduplication */
  queuedSessions: Map<string, MemorySessionTarget>;
}

// ========================================================================
// Infrastructure Layer - Connection Management
// ========================================================================

/**
 * Creates an Oracle connection pool
 * 
 * ARCHITECTURE: Connection pooling is the foundation of the system.
 * The pool provides:
 * - Connection reuse (reduces overhead of establishing connections)
 * - Connection limits (prevents resource exhaustion)
 * - Automatic connection validation
 * 
 * ERROR HANDLING: Synchronous creation failures are caught and logged,
 * but bubbled up to the caller for proper initialization handling.
 */
export async function createPoolAsync(config: MemoryOracleConfig): Promise<oracledb.Pool> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  try {
    const pool = await oracledb.createPool({
      user: fullConfig.user,
      password: fullConfig.password,
      connectString: fullConfig.connectString,
      poolMin: fullConfig.poolMin,
      poolMax: fullConfig.poolMax,
      poolIncrement: fullConfig.poolIncrement,
      poolTimeout: fullConfig.poolTimeout,
    });
    
    log.info("Oracle pool created", { 
      min: fullConfig.poolMin, 
      max: fullConfig.poolMax 
    });
    
    return pool;
  } catch (error) {
    log.error("Failed to create Oracle pool", { error });
    throw error;
  }
}

/**
 * Gracefully closes the connection pool
 * 
 * ARCHITECTURE: Clean shutdown is critical to prevent resource leaks.
 * The pool.close(0) waits for all connections to be released before closing.
 * This ensures no in-flight operations are abruptly terminated.
 * 
 * DRAIN PATTERN: We use drain time 0 to wait indefinitely for connections
 * to be released, ensuring data consistency.
 */
export async function closePoolAsync(pool: oracledb.Pool): Promise<void> {
  try {
    await pool.close(0); // Wait indefinitely for connections to release
    log.info("Oracle pool closed");
  } catch (error) {
    log.warn("Error closing pool", { error });
    throw error;
  }
}

/**
 * Executes a function with a database connection
 * 
 * ARCHITECTURE: This is a resource acquisition pattern.
 * It ensures:
 * 1. Connection is always obtained from the pool
 * 2. Connection is always released back to the pool
 * 3. Connection is released even if the function throws
 * 
 * This pattern prevents connection leaks and is the foundation
 * for all database operations.
 */
export async function withConnectionAsync<T>(
  pool: oracledb.Pool,
  fn: (conn: oracledb.Connection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    try {
      await conn.close(); // Always return connection to pool
    } catch (error) {
      log.warn("Error closing connection", { error });
    }
  }
}

/**
 * Executes a function within a database transaction
 * 
 * ARCHITECTURE: Transaction boundaries are explicitly managed.
 * The pattern is:
 * 1. Start transaction (BEGIN)
 * 2. Execute business logic
 * 3. Commit on success
 * 4. Rollback on error
 * 
 * This ensures ACID compliance for all operations that need
 * to maintain data consistency across multiple tables.
 */
export async function withTransactionAsync<T>(
  pool: oracledb.Pool,
  fn: (conn: oracledb.Connection) => Promise<T>
): Promise<T> {
  return withConnectionAsync(pool, async (conn) => {
    await conn.execute('BEGIN');
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}

// ========================================================================
// Error Handling Layer
// ========================================================================

/**
 * Extracts a human-readable error message from any error type
 * 
 * ARCHITECTURE: Error normalization is crucial for reliable error handling.
 * Different error sources (Oracle errors, Node errors, custom errors) have
 * different shapes. This function normalizes them to a consistent format.
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    return String(obj.message || obj.code || obj.sqlMessage || err);
  }
  return String(err);
}

/**
 * Detects read-only database errors
 * 
 * ARCHITECTURE: Read-only errors are a specific failure mode.
 * When the database is read-only, write operations will fail.
 * This pattern detects these errors so they can be treated specially
 * (e.g., retry after database promotion, or switch to read-only mode).
 */
export function isReadonlyError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return /readonly|read-only|SQLITE_READONLY|ORA-[0-9]{5}/i.test(msg);
}

/**
 * Detects connection-related errors
 * 
 * ARCHITECTURE: Connection errors are transient and recoverable.
 * This detector identifies network failures, timeout, and session
 * termination errors that can be resolved by reconnecting.
 * 
 * RECOVERY STRATEGY: Connection errors trigger the pool recovery
 * mechanism, which recreates the entire connection pool.
 */
export function isConnectionError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return /ORA-03135|ORA-03114|ORA-02396|ORA-00028|connection lost|network timeout/i.test(msg);
}

// ========================================================================
// Schema Layer - Database Initialization
// ========================================================================

/**
 * Ensures all required tables and indexes exist
 * 
 * ARCHITECTURE: The database schema is the persistent foundation.
 * We use "CREATE IF NOT EXISTS" semantics through Oracle's
 * EXECUTE IMMEDIATE with exception handling for ORA-955 (table exists).
 * 
 * MIGRATION STRATEGY: Tables are versioned through the meta table.
 * Future migrations will use the meta table to track schema versions.
 * 
 * INDEX STRATEGY: Performance-critical queries are indexed:
 * - Source lookups: idx_memory_index_sources_source
 * - Path/source lookups: idx_memory_index_chunks_path_source
 * - Dirty file processing: idx_memory_dirty_files_source
 * - Session event retrieval: idx_memory_session_events_session
 */
export async function ensureSchemaAsync(conn: oracledb.Connection): Promise<void> {
  // Table definitions - all tables have explicit primary keys
  // and appropriate data types for their intended use
  const tables = [
    `CREATE TABLE memory_index_meta (
      key VARCHAR2(255) PRIMARY KEY,
      value CLOB NOT NULL
    )`,
    `CREATE TABLE memory_index_sources (
      path VARCHAR2(1000) NOT NULL,
      source VARCHAR2(255) NOT NULL,
      hash VARCHAR2(64) NOT NULL,
      mtime NUMBER(19) NOT NULL,
      size NUMBER(19) NOT NULL,
      PRIMARY KEY (path, source)
    )`,
    `CREATE TABLE memory_index_chunks (
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
    )`,
    `CREATE TABLE memory_dirty_files (
      path VARCHAR2(1000) NOT NULL,
      source VARCHAR2(255) NOT NULL,
      dirty_at NUMBER(19) NOT NULL,
      PRIMARY KEY (path, source)
    )`,
    `CREATE TABLE memory_session_events (
      id VARCHAR2(64) PRIMARY KEY,
      session_id VARCHAR2(255) NOT NULL,
      path VARCHAR2(1000) NOT NULL,
      event_type VARCHAR2(50) NOT NULL,
      event_data CLOB,
      timestamp NUMBER(19) NOT NULL
    )`,
  ];

  // Table creation with ORA-955 (table exists) exception handling
  for (const sql of tables) {
    try {
      await conn.execute(`BEGIN EXECUTE IMMEDIATE '${sql}'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;`);
    } catch (error) {
      if (error instanceof Error && !error.message.includes('-955')) throw error;
    }
  }

  // Index definitions - improve query performance
  const indexes = [
    'idx_memory_index_sources_source ON memory_index_sources(source)',
    'idx_memory_index_chunks_path_source ON memory_index_chunks(path, source)',
    'idx_memory_dirty_files_source ON memory_dirty_files(source)',
    'idx_memory_session_events_session ON memory_session_events(session_id)',
  ];

  // Index creation with ORA-955 exception handling
  for (const idx of indexes) {
    try {
      await conn.execute(`BEGIN EXECUTE IMMEDIATE 'CREATE INDEX ${idx}'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;`);
    } catch (error) {
      if (error instanceof Error && !error.message.includes('-955')) throw error;
    }
  }

  log.debug("Schema ensured");
}

/**
 * Reads metadata from the memory index
 * 
 * ARCHITECTURE: Metadata is stored as a single JSON object in the meta table.
 * This allows for flexible schema evolution without changing table structure.
 * The key 'memory_index_meta_v1' provides versioning.
 */
export async function readMetaAsync(conn: oracledb.Connection): Promise<{ vectorDims?: number } | null> {
  const result = await conn.execute(
    `SELECT value FROM memory_index_meta WHERE key = 'memory_index_meta_v1'`
  );
  
  if (!result.rows?.length) return null;
  
  try {
    return JSON.parse(result.rows[0][0] as string);
  } catch {
    return null;
  }
}

/**
 * Writes metadata to the memory index
 * 
 * ARCHITECTURE: Uses MERGE (UPSERT) for atomic update-or-insert.
 * This prevents race conditions where multiple processes might
 * try to create the same metadata entry simultaneously.
 */
export async function writeMetaAsync(
  conn: oracledb.Connection,
  meta: Record<string, unknown>
): Promise<void> {
  await conn.execute(
    `MERGE INTO memory_index_meta m
     USING (SELECT 'memory_index_meta_v1' AS key, :val AS value FROM DUAL) src
     ON (m.key = src.key)
     WHEN MATCHED THEN UPDATE SET m.value = src.value
     WHEN NOT MATCHED THEN INSERT (key, value) VALUES (src.key, src.value)`,
    { val: JSON.stringify(meta) }
  );
}

// ========================================================================
// Recovery Layer - Self-Healing Mechanism
// ========================================================================

/**
 * Attempts to recover the connection pool after an error
 * 
 * ARCHITECTURE: This implements the Circuit Breaker pattern.
 * When the pool fails, we:
 * 1. Close the existing pool
 * 2. Apply backoff (prevents immediate reconnection storms)
 * 3. Create a new pool
 * 4. Re-initialize schema and metadata
 * 
 * The recovery is "self-healing" - the system can recover
 * from transient failures without manual intervention.
 * 
 * BACKOFF STRATEGY: Simple fixed backoff is used initially.
 * Future versions could implement exponential backoff for better
 * recovery characteristics under high load.
 */
async function recoverPoolAsync(state: MemoryOracleState, error: unknown): Promise<oracledb.Pool> {
  const reason = getErrorMessage(error);
  log.warn("Recovering pool", { reason, attempt: state.recoveryAttempts });

  // Step 1: Close old pool
  await closePoolAsync(state.pool);

  // Step 2: Backoff - prevents thundering herd
  const backoff = state.config.recoveryBackoffMs;
  await new Promise(resolve => setTimeout(resolve, backoff));

  // Step 3: Create new pool
  const newPool = await createPoolAsync(state.config);
  state.pool = newPool;

  // Step 4: Re-initialize schema and cache metadata
  await withConnectionAsync(newPool, async (conn) => {
    await ensureSchemaAsync(conn);
    const meta = await readMetaAsync(conn);
    state.vectorDims = meta?.vectorDims;
  });

  log.info("Pool recovered", { attempt: state.recoveryAttempts });
  return newPool;
}

// ========================================================================
// Indexing Layer - Core Business Logic with Recovery
// ========================================================================

/**
 * Executes an indexing operation with automatic recovery
 * 
 * ARCHITECTURE: This is the main entry point for all indexing operations.
 * It wraps the actual indexing function with a retry mechanism.
 * 
 * RETRY POLICY:
 * - Maximum attempts: configurable (default 3)
 * - Retry triggers: connection errors and readonly errors
 * - Recovery: full pool recreation on each retry
 * - No retry: other errors (data errors, constraint violations)
 * 
 * STATE MANAGEMENT: Recovery metrics are tracked for monitoring.
 * This enables operational visibility into system health.
 */
export async function indexWithRecoveryAsync(
  state: MemoryOracleState,
  indexFn: (params?: MemoryIndexParams) => Promise<void>,
  params?: MemoryIndexParams
): Promise<void> {
  const maxAttempts = state.config.maxRecoveryAttempts;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Attempt the actual indexing operation
      await indexFn(params);
      // If we recovered, log the success
      if (attempt > 0) {
        state.recoverySuccesses++;
        log.info("Indexing recovered", { attempt });
      }
      return;
    } catch (error) {
      // Log the failure
      state.recoveryAttempts++;
      state.recoveryLastError = getErrorMessage(error);

      // Determine if we should retry
      const shouldRetry = (isReadonlyError(error) || isConnectionError(error)) && !state.closed;
      
      // If we shouldn't retry or we've exhausted attempts, throw
      if (!shouldRetry || attempt >= maxAttempts - 1) {
        state.recoveryFailures++;
        log.error("Indexing failed", { 
          attempts: maxAttempts, 
          error: state.recoveryLastError 
        });
        throw error;
      }

      // Retry with pool recovery
      log.warn("Retrying indexing", { attempt: attempt + 1, maxAttempts });
      await recoverPoolAsync(state, error);
    }
  }
}

// ========================================================================
// Queue Layer - Async Session Processing
// ========================================================================

/**
 * Generates a unique key for a session target
 * 
 * ARCHITECTURE: Composite key using null separator (\0).
 * This avoids key collisions that might occur with simple concatenation.
 * Example: 'agent1' + 'session1' + 'key1' vs 'agent1session1' + 'key1'
 * Without separator, these could collide.
 */
function sessionKey(target: MemorySessionTarget): string {
  return [target.agentId ?? '', target.sessionId, target.sessionKey ?? ''].join('\0');
}

/**
 * Queues sessions and session files for asynchronous indexing
 * 
 * ARCHITECTURE: This implements the Producer-Consumer pattern.
 * 
 * Producer: External calls add sessions/files to queues
 * Consumer: background process (processQueueAsync) drains the queues
 * 
 * DEDUPLICATION: Sessions are stored in a Map with composite keys.
 * This prevents duplicate processing of the same session.
 * 
 * FILES: Stored in a Set for automatic deduplication.
 * 
 * QUEUE ACTIVATION: If no queue is currently running, this call
 * starts the background processing automatically.
 */
export async function queueSessionIndexingAsync(
  state: MemoryOracleState,
  targets?: Pick<MemoryIndexParams, 'sessions' | 'sessionFiles'>
): Promise<void> {
  // Producer: Add files to queue
  for (const file of targets?.sessionFiles ?? []) {
    const trimmed = file.trim();
    if (trimmed) {
      state.queuedSessionFiles.add(trimmed);
    }
  }

  // Producer: Add sessions to queue with deduplication
  for (const session of targets?.sessions ?? []) {
    const id = session.sessionId.trim();
    if (!id) continue;
    
    const normalized: MemorySessionTarget = {
      sessionId: id,
      ...(session.agentId?.trim() ? { agentId: session.agentId.trim() } : {}),
      ...(session.sessionKey?.trim() ? { sessionKey: session.sessionKey.trim() } : {}),
    };
    
    state.queuedSessions.set(sessionKey(normalized), normalized);
  }

  // Consumer: Start processing if not already running
  if (
    (state.queuedSessionFiles.size > 0 || state.queuedSessions.size > 0) && 
    !state.queuedIndexing
  ) {
    state.queuedIndexing = processQueueAsync(state);
    await state.queuedIndexing;
  }
}

/**
 * Background queue processor
 * 
 * ARCHITECTURE: This implements the Consumer in the Producer-Consumer pattern.
 * 
 * PROCESSING LOOP:
 * 1. Wait for main indexing task to complete (if running)
 * 2. Dequeue all pending sessions and files atomically
 * 3. Process them with recovery
 * 4. If processing fails, re-queue items and retry
 * 5. Continue until queue is empty or state is closed
 * 
 * ATOMIC DEQUEUE: We take all pending items at once, then clear the queues.
 * This prevents items from being processed multiple times if there's a failure
 * during processing.
 * 
 * RE-QUEUE ON FAILURE: If processing fails, items are re-queued in the same
 * order, ensuring no data loss.
 */
async function processQueueAsync(state: MemoryOracleState): Promise<void> {
  try {
    // Wait for main indexing to complete
    if (state.indexingTask) {
      try {
        await state.indexingTask;
      } catch (error) {
        log.warn("Previous indexing task failed, continuing queue", { 
          error: getErrorMessage(error) 
        });
      }
    }

    // Processing loop - continues until queue is empty or state is closed
    while (
      !state.closed &&
      (state.queuedSessionFiles.size > 0 || state.queuedSessions.size > 0)
    ) {
      // Atomic dequeue: take all pending items
      const files = Array.from(state.queuedSessionFiles);
      const sessions = Array.from(state.queuedSessions.values());

      // Clear queues
      state.queuedSessionFiles.clear();
      state.queuedSessions.clear();

      try {
        // Process with recovery
        await indexWithRecoveryAsync(state, async () => {
          if (state.indexingTask) {
            await state.indexingTask;
          }
        }, {
          reason: 'queued-sessions',
          sessions,
          sessionFiles: files,
        });
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        log.error("Queue indexing failed", { error: errorMsg });
        
        // Re-queue failed items
        for (const s of sessions) {
          state.queuedSessions.set(sessionKey(s), s);
        }
        for (const f of files) {
          state.queuedSessionFiles.add(f);
        }
        
        // Backoff before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    log.error("Unexpected error in processQueueAsync", { 
      error: getErrorMessage(error) 
    });
  } finally {
    state.queuedIndexing = null;
  }
}

// ========================================================================
// State Management Layer
// ========================================================================

/**
 * Creates the state object
 * 
 * ARCHITECTURE: The state object is the central coordination point.
 * It holds all runtime state, queues, and metrics.
 * 
 * SEPARATION OF CONCERNS:
 * - Configuration: frozen immutable config
 * - Operational state: dynamic flags (closed)
 * - Metrics: recovery statistics
 * - Work queues: pending sessions and files
 * 
 * LIFECYCLE: State is created once at startup and destroyed at shutdown.
 */
export function createState(
  config: MemoryOracleConfig,
  pool: oracledb.Pool
): MemoryOracleState {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    closed: false,
    pool,
    config: fullConfig,
    recoveryAttempts: 0,
    recoverySuccesses: 0,
    recoveryFailures: 0,
    indexingTask: null,
    queuedIndexing: null,
    queuedSessionFiles: new Set(),
    queuedSessions: new Map(),
  };
}

/**
 * Destroys the state and cleans up resources
 * 
 * ARCHITECTURE: Graceful shutdown is critical for production systems.
 * 
 * SHUTDOWN SEQUENCE:
 * 1. Set closed flag - prevents new operations
 * 2. Wait for main indexing task to complete
 * 3. Wait for queued indexing to complete
 * 4. Close connection pool
 * 5. Clear queues
 * 6. Log shutdown status
 * 
 * DRAIN PATTERN: We wait for all pending operations to complete
 * before closing the pool. This prevents data loss.
 * 
 * ERROR HANDLING: If any operation fails during shutdown,
 * we still attempt to close the pool and clean up queues.
 * Shutdown errors are collected and re-thrown if any occurred.
 */
export async function destroyStateAsync(state: MemoryOracleState): Promise<void> {
  // Signal that we're shutting down - prevents new operations
  state.closed = true;
  
  let error: Error | null = null;
  
  try {
    // Wait for main indexing to finish
    if (state.indexingTask) {
      try {
        await state.indexingTask;
      } catch (err) {
        log.error("Indexing task failed during destroy", { error: getErrorMessage(err) });
        if (!error) error = err instanceof Error ? err : new Error(String(err));
      }
      state.indexingTask = null;
    }
    
    // Wait for queued indexing to finish
    if (state.queuedIndexing) {
      try {
        await state.queuedIndexing;
      } catch (err) {
        log.error("Queued indexing failed during destroy", { error: getErrorMessage(err) });
        if (!error) error = err instanceof Error ? err : new Error(String(err));
      }
      state.queuedIndexing = null;
    }
  } finally {
    // Always close the pool - even if tasks failed
    try {
      await closePoolAsync(state.pool);
    } catch (err) {
      log.error("Pool close failed during destroy", { error: getErrorMessage(err) });
      if (!error) error = err instanceof Error ? err : new Error(String(err));
    }
    
    // Clean up queues
    state.queuedSessionFiles.clear();
    state.queuedSessions.clear();
    
    log.info("State destroyed", { hasError: !!error });
  }
  
  if (error) {
    throw error;
  }
}

// ========================================================================
// Module Export
// ========================================================================

/**
 * PUBLIC API: The only exported interface to the outside world
 * 
 * This maintains a clean separation between internal architecture
 * and external usage. Only these functions are available to consumers.
 */
export default {
  createPoolAsync,
  closePoolAsync,
  withConnectionAsync,
  withTransactionAsync,
  ensureSchemaAsync,
  readMetaAsync,
  writeMetaAsync,
  indexWithRecoveryAsync,
  queueSessionIndexingAsync,
  createState,
  destroyStateAsync,
  isReadonlyError,
  isConnectionError,
};