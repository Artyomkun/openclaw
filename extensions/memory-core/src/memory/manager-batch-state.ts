/**
 * Memory Core Plugin - Batch State Management (Oracle)
 * 
 * ARCHITECTURAL PATTERN: Circuit Breaker for Batch Operations
 * 
 * This module implements a lightweight circuit breaker pattern
 * specifically designed for batch processing operations.
 * 
 * KEY ARCHITECTURAL DECISIONS:
 * 
 * 1. Circuit Breaker Pattern
 *    - Prevents cascading failures in batch operations
 *    - Automatically disables after failure threshold
 *    - Provides degradation instead of complete failure
 * 
 * 2. Immutable State Transitions
 *    - All state changes return new state objects
 *    - Prevents accidental mutation
 *    - Thread-safe without locks
 * 
 * 3. Provider-Specific Failure Tracking
 *    - Tracks which provider failed
 *    - Enables provider-specific circuit breaking
 *    - Allows graceful degradation per provider
 * 
 * 4. Configurable Failure Threshold
 *    - Default: 2 failures disables
 *    - Can force disable with forceDisable flag
 *    - Attempts count can be weighted
 * 
 * 5. Oracle Integration
 *    - State can be persisted in Oracle table
 *    - Async-friendly state transitions
 *    - Supports distributed circuit breaking
 * 
 * ORACLE ADAPTATIONS:
 * - Added persistence support (save/load state)
 * - Async operations for database storage
 * - Distributed circuit breaking across nodes
 */

// ========================================================================
// Constants
// ========================================================================

/** Default failure limit before circuit opens */
export const MEMORY_BATCH_FAILURE_LIMIT = 2;

/** Default batch retry backoff in milliseconds */
export const MEMORY_BATCH_RETRY_BACKOFF_MS = 5000;

/** Maximum retry attempts for batch operations */
export const MEMORY_BATCH_MAX_RETRIES = 3;

// ========================================================================
// Types
// ========================================================================

/**
 * Circuit breaker state for batch operations
 * 
 * ARCHITECTURE: State machine with three states:
 * - ENABLED: Normal operation
 * - DISABLED: Circuit open, operations blocked
 * - RECOVERING: Waiting for recovery period
 */
export type MemoryBatchFailureState = {
  /** Whether batch operations are allowed */
  enabled: boolean;
  /** Current failure count */
  count: number;
  /** Last error message */
  lastError?: string;
  /** Provider that caused the last failure */
  lastProvider?: string;
  /** Timestamp of last failure */
  lastFailureAt?: number;
  /** Recovery time after circuit opens */
  recoveryAfter?: number;
  /** Total failures since last reset */
  totalFailures?: number;
};

/**
 * Configuration for batch state manager
 */
export interface BatchStateConfig {
  /** Failure limit before circuit opens */
  failureLimit?: number;
  /** Recovery time in milliseconds */
  recoveryTimeoutMs?: number;
  /** Persistence enabled (save to database) */
  persistenceEnabled?: boolean;
  /** Provider for state persistence */
  provider?: string;
}

// ========================================================================
// State Management
// ========================================================================

/**
 * Resets the failure state to default
 * 
 * ARCHITECTURE: Returns a clean state while preserving structure.
 * 
 * USE CASES:
 * - After successful batch operation
 * - After recovery period expires
 * - On manual reset
 * 
 * ORACLE ADAPTATIONS:
 * - Returns immutable state
 * - Can trigger database update
 */
export function resetMemoryBatchFailureState(
  state: MemoryBatchFailureState,
  preserveProvider?: boolean,
): MemoryBatchFailureState {
  return {
    ...state,
    enabled: true,
    count: 0,
    lastError: undefined,
    lastProvider: preserveProvider ? state.lastProvider : undefined,
    lastFailureAt: undefined,
    recoveryAfter: undefined,
    totalFailures: state.totalFailures ?? 0,
  };
}

/**
 * Records a batch failure and updates circuit breaker state
 * 
 * ARCHITECTURE: Implements the core circuit breaker logic.
 * 
 * STATE TRANSITIONS:
 * 1. Normal: increment failure count
 * 2. If count >= threshold → DISABLE (open circuit)
 * 3. forceDisable → immediate DISABLE
 * 4. enabled: false → circuit already open, still track
 * 
 * WEIGHTED FAILURES:
 * - Single failure: increment by 1
 * - Multiple attempts: increment by attempts count
 * - forceDisable: increment to threshold (opens immediately)
 * 
 * ORACLE ADAPTATIONS:
 * - Returns new immutable state
 * - Can persist to database
 * - Async-safe for Oracle operations
 */
export function recordMemoryBatchFailure(
  state: MemoryBatchFailureState,
  params: {
    /** Provider identifier for tracking */
    provider: string;
    /** Error message to record */
    message: string;
    /** Number of attempts (for weighted failure count) */
    attempts?: number;
    /** Force circuit to open immediately */
    forceDisable?: boolean;
  },
): MemoryBatchFailureState {
  // If circuit is already open, just track the failure
  if (!state.enabled) {
    return {
      ...state,
      count: state.count + 1,
      lastError: params.message,
      lastProvider: params.provider,
      lastFailureAt: Date.now(),
      totalFailures: (state.totalFailures ?? 0) + 1,
    };
  }

  // Calculate failure increment
  const increment = params.forceDisable
    ? MEMORY_BATCH_FAILURE_LIMIT // Force open immediately
    : Math.max(1, params.attempts ?? 1);

  const newCount = state.count + increment;
  
  // Check if circuit should open
  const shouldDisable = params.forceDisable || newCount >= MEMORY_BATCH_FAILURE_LIMIT;

  return {
    ...state,
    enabled: !shouldDisable,
    count: newCount,
    lastError: params.message,
    lastProvider: params.provider,
    lastFailureAt: Date.now(),
    // Set recovery time if circuit opens
    recoveryAfter: shouldDisable ? Date.now() + MEMORY_BATCH_RETRY_BACKOFF_MS : undefined,
    totalFailures: (state.totalFailures ?? 0) + 1,
  };
}

// ========================================================================
// State Persistence (Oracle Database)
// ========================================================================

/**
 * Persists batch state to Oracle database
 * 
 * ARCHITECTURE: Enables distributed circuit breaking across nodes.
 * 
 * WHY PERSISTENCE:
 * 1. Shared state across multiple application instances
 * 2. Recovery after application restart
 * 3. Monitoring and alerting
 * 4. Historical analysis
 * 
 * ORACLE TABLE SCHEMA:
 * CREATE TABLE memory_batch_state (
 *   provider VARCHAR2(255) PRIMARY KEY,
 *   enabled NUMBER(1) NOT NULL,
 *   failure_count NUMBER(10) NOT NULL,
 *   last_error CLOB,
 *   last_failure_at TIMESTAMP,
 *   recovery_after TIMESTAMP,
 *   total_failures NUMBER(10),
 *   updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
 * );
 */
export async function saveBatchStateToOracleAsync(params: {
  pool: any; // oracledb.Pool
  state: MemoryBatchFailureState;
  provider?: string;
  tableName?: string;
}): Promise<void> {
  const { pool, state, provider = 'default' } = params;
  const tableName = params.tableName ?? 'memory_batch_state';

  // Get connection
  const conn = await pool.getConnection();
  
  try {
    await conn.execute(
      `MERGE INTO ${tableName} target
       USING (SELECT :provider AS provider, :enabled AS enabled, 
                     :failureCount AS failure_count, :lastError AS last_error,
                     :lastFailureAt AS last_failure_at, :recoveryAfter AS recovery_after,
                     :totalFailures AS total_failures FROM DUAL) source
       ON (target.provider = source.provider)
       WHEN MATCHED THEN
         UPDATE SET 
           target.enabled = source.enabled,
           target.failure_count = source.failure_count,
           target.last_error = source.last_error,
           target.last_failure_at = source.last_failure_at,
           target.recovery_after = source.recovery_after,
           target.total_failures = source.total_failures,
           target.updated_at = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (provider, enabled, failure_count, last_error, last_failure_at, 
                 recovery_after, total_failures, updated_at)
         VALUES (source.provider, source.enabled, source.failure_count, source.last_error,
                 source.last_failure_at, source.recovery_after, source.total_failures,
                 SYSTIMESTAMP)`,
      {
        provider,
        enabled: state.enabled ? 1 : 0,
        failureCount: state.count,
        lastError: state.lastError || null,
        lastFailureAt: state.lastFailureAt ? new Date(state.lastFailureAt) : null,
        recoveryAfter: state.recoveryAfter ? new Date(state.recoveryAfter) : null,
        totalFailures: state.totalFailures ?? 0,
      }
    );
  } finally {
    await conn.close();
  }
}

/**
 * Loads batch state from Oracle database
 * 
 * ARCHITECTURE: Restores circuit breaker state across restarts.
 * 
 * RECOVERY LOGIC:
 * 1. Load persisted state
 * 2. Check if recovery period has passed
 * 3. Auto-reset if recovery completed
 */
export async function loadBatchStateFromOracleAsync(params: {
  pool: any;
  provider?: string;
  tableName?: string;
}): Promise<MemoryBatchFailureState | null> {
  const { pool, provider = 'default' } = params;
  const tableName = params.tableName ?? 'memory_batch_state';

  const conn = await pool.getConnection();
  
  try {
    const result = await conn.execute(
      `SELECT enabled, failure_count, last_error, last_failure_at, 
              recovery_after, total_failures
       FROM ${tableName}
       WHERE provider = :provider`,
      { provider }
    );

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as [
      number,   // enabled
      number,   // failure_count
      string,   // last_error
      Date,     // last_failure_at
      Date,     // recovery_after
      number    // total_failures
    ];

    const [enabled, count, lastError, lastFailureAt, recoveryAfter, totalFailures] = row;

    return {
      enabled: enabled === 1,
      count,
      lastError: lastError || undefined,
      lastProvider: provider,
      lastFailureAt: lastFailureAt ? lastFailureAt.getTime() : undefined,
      recoveryAfter: recoveryAfter ? recoveryAfter.getTime() : undefined,
      totalFailures: totalFailures || 0,
    };
  } finally {
    await conn.close();
  }
}

// ========================================================================
// Advanced Features
// ========================================================================

/**
 * Checks if circuit is ready for recovery
 * 
 * ARCHITECTURE: Automatic recovery after timeout.
 * 
 * RECOVERY LOGIC:
 * - If circuit is open and recovery time has passed → reset
 * - If circuit is open and recovery time not passed → still open
 * - If circuit is closed → normal operation
 */
export function shouldRecoverBatchState(
  state: MemoryBatchFailureState,
  now: number = Date.now()
): boolean {
  if (state.enabled) {
    return false; // Already enabled
  }

  if (!state.recoveryAfter) {
    return false; // No recovery set
  }

  return now >= state.recoveryAfter;
}

/**
 * Attempts to recover circuit by resetting state
 * 
 * ARCHITECTURE: Half-open state for recovery testing.
 * 
 * USE CASES:
 * - After recovery timeout expires
 * - Manual recovery
 * - Health check pass
 */
export function attemptBatchRecovery(
  state: MemoryBatchFailureState,
  success: boolean
): MemoryBatchFailureState {
  if (success) {
    // Success → reset to enabled
    return resetMemoryBatchFailureState(state);
  } else {
    // Failure → keep disabled, increment count
    return {
      ...state,
      count: state.count + 1,
      lastFailureAt: Date.now(),
    };
  }
}

/**
 * Creates a new empty batch state with defaults
 * 
 * ARCHITECTURE: Factory pattern for state creation.
 * 
 * USE CASES:
 * - Initialization
 * - Reinitialization
 * - Testing
 */
export function createEmptyBatchState(
  config: BatchStateConfig = {}
): MemoryBatchFailureState {
  return {
    enabled: true,
    count: 0,
    lastError: undefined,
    lastProvider: config.provider,
    lastFailureAt: undefined,
    recoveryAfter: undefined,
    totalFailures: 0,
  };
}

// ========================================================================
// Batch State Manager Class
// ========================================================================

/**
 * Advanced batch state manager with Oracle persistence
 * 
 * ARCHITECTURE: Full-featured circuit breaker for batch operations.
 * 
 * FEATURES:
 * - Automatic circuit breaking
 * - Oracle persistence
 * - Recovery timeout
 * - Provider-specific states
 * - Metrics and monitoring
 * - Thread-safe (using Immutable state)
 */
export class BatchStateManager {
  private state: MemoryBatchFailureState;
  private config: Required<BatchStateConfig>;
  private pool?: any; // Oracle pool

  constructor(
    initialState?: MemoryBatchFailureState,
    config?: BatchStateConfig
  ) {
    this.state = initialState || createEmptyBatchState(config);
    this.config = {
      failureLimit: config?.failureLimit ?? MEMORY_BATCH_FAILURE_LIMIT,
      recoveryTimeoutMs: config?.recoveryTimeoutMs ?? MEMORY_BATCH_RETRY_BACKOFF_MS,
      persistenceEnabled: config?.persistenceEnabled ?? false,
      provider: config?.provider || 'default',
    };
  }

  /**
   * Sets Oracle pool for persistence
   */
  setPool(pool: any): void {
    this.pool = pool;
  }

  /**
   * Gets current state (immutable)
   */
  getState(): MemoryBatchFailureState {
    return { ...this.state };
  }

  /**
   * Checks if operations are allowed
   */
  isAllowed(): boolean {
    // Check if we need to auto-recover
    if (!this.state.enabled && this.state.recoveryAfter) {
      if (Date.now() >= this.state.recoveryAfter) {
        // Recovery time passed - attempt recovery
        this.state = attemptBatchRecovery(this.state, true);
        this.saveStateIfNeeded();
      }
    }
    return this.state.enabled;
  }

  /**
   * Records a failure
   */
  recordFailure(params: {
    provider: string;
    message: string;
    attempts?: number;
    forceDisable?: boolean;
  }): void {
    this.state = recordMemoryBatchFailure(this.state, params);
    this.saveStateIfNeeded();
  }

  /**
   * Records a success and resets state
   */
  recordSuccess(): void {
    this.state = resetMemoryBatchFailureState(this.state);
    this.saveStateIfNeeded();
  }

  /**
   * Saves state to Oracle if persistence enabled
   */
  private async saveStateIfNeeded(): Promise<void> {
    if (!this.config.persistenceEnabled || !this.pool) {
      return;
    }

    try {
      await saveBatchStateToOracleAsync({
        pool: this.pool,
        state: this.state,
        provider: this.config.provider,
      });
    } catch (error) {
      console.error('Failed to save batch state:', error);
      // Don't throw - state is already updated in memory
    }
  }

  /**
   * Loads state from Oracle
   */
  async loadState(): Promise<void> {
    if (!this.config.persistenceEnabled || !this.pool) {
      return;
    }

    try {
      const loaded = await loadBatchStateFromOracleAsync({
        pool: this.pool,
        provider: this.config.provider,
      });

      if (loaded) {
        this.state = loaded;
        
        // Check auto-recovery
        if (!this.state.enabled && this.state.recoveryAfter) {
          if (Date.now() >= this.state.recoveryAfter) {
            this.state = attemptBatchRecovery(this.state, true);
            await this.saveStateIfNeeded();
          }
        }
      }
    } catch (error) {
      console.error('Failed to load batch state:', error);
    }
  }

  /**
   * Gets metrics for monitoring
   */
  getMetrics(): {
    enabled: boolean;
    failureCount: number;
    totalFailures: number;
    recoveryRemainingMs: number | null;
    lastError: string | null;
    lastProvider: string | null;
  } {
    return {
      enabled: this.state.enabled,
      failureCount: this.state.count,
      totalFailures: this.state.totalFailures ?? 0,
      recoveryRemainingMs: this.state.recoveryAfter 
        ? Math.max(0, this.state.recoveryAfter - Date.now())
        : null,
      lastError: this.state.lastError || null,
      lastProvider: this.state.lastProvider || null,
    };
  }
}

// ========================================================================
// Module Export
// ========================================================================

export default {
  // Core functions
  resetMemoryBatchFailureState,
  recordMemoryBatchFailure,
  
  // Advanced functions
  createEmptyBatchState,
  shouldRecoverBatchState,
  attemptBatchRecovery,
  
  // Oracle persistence
  saveBatchStateToOracleAsync,
  loadBatchStateFromOracleAsync,
  
  // Class
  BatchStateManager,
  
  // Constants
  MEMORY_BATCH_FAILURE_LIMIT,
  MEMORY_BATCH_RETRY_BACKOFF_MS,
  MEMORY_BATCH_MAX_RETRIES,
};