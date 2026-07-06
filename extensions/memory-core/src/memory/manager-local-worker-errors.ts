/**
 * Memory Core Plugin - Oracle Local Worker Errors Module
 * 
 * Oracle-only local worker error handling.
 * 
 * RESPONSIBILITIES:
 * - Define local embedding worker error codes
 * - Type-safe error handling
 * - Error detection utilities
 * - Error classification
 * 
 * ORACLE ADAPTATIONS:
 * - Oracle-specific error codes
 * - Connection pool error detection
 * - AI Vector Search worker errors
 * - Oracle Text worker errors
 */

// ========================================================================
// Types
// ========================================================================

/**
 * Local embedding worker error codes.
 */
export const LOCAL_EMBEDDING_WORKER_ERROR_CODES = {
  /** Worker exited unexpectedly */
  exited: "LOCAL_EMBEDDING_WORKER_EXITED",
  /** Process error */
  processError: "LOCAL_EMBEDDING_WORKER_PROCESS_ERROR",
  /** IPC communication error */
  ipcError: "LOCAL_EMBEDDING_WORKER_IPC_ERROR",
  /** Worker timeout */
  timeout: "LOCAL_EMBEDDING_WORKER_TIMEOUT",
  /** Worker crashed */
  crashed: "LOCAL_EMBEDDING_WORKER_CRASHED",
  /** Worker hung */
  hung: "LOCAL_EMBEDDING_WORKER_HUNG",
} as const;

/**
 * Oracle-specific local worker error codes.
 */
export const ORACLE_LOCAL_WORKER_ERROR_CODES = {
  /** Oracle connection lost */
  connectionLost: "ORACLE_WORKER_CONNECTION_LOST",
  /** Oracle AI Vector Search error */
  aiVectorError: "ORACLE_WORKER_AI_VECTOR_ERROR",
  /** Oracle Text error */
  textError: "ORACLE_WORKER_TEXT_ERROR",
  /** Oracle pool exhausted */
  poolExhausted: "ORACLE_WORKER_POOL_EXHAUSTED",
  /** Oracle timeout */
  timeout: "ORACLE_WORKER_TIMEOUT",
} as const;

/**
 * Local embedding worker failure code type.
 */
export type LocalEmbeddingWorkerFailureCode =
  (typeof LOCAL_EMBEDDING_WORKER_ERROR_CODES)[keyof typeof LOCAL_EMBEDDING_WORKER_ERROR_CODES];

/**
 * Oracle local worker failure code type.
 */
export type OracleLocalWorkerFailureCode =
  (typeof ORACLE_LOCAL_WORKER_ERROR_CODES)[keyof typeof ORACLE_LOCAL_WORKER_ERROR_CODES];

/**
 * Local embedding worker failure error.
 */
export type LocalEmbeddingWorkerFailureError = Error & {
  code: LocalEmbeddingWorkerFailureCode;
  /** Oracle-specific error code */
  oracleCode?: OracleLocalWorkerFailureCode;
  /** Original Oracle error */
  oracleError?: any;
};

/**
 * Oracle local worker failure error.
 */
export type OracleLocalWorkerFailureError = Error & {
  code: OracleLocalWorkerFailureCode;
  /** Original error cause */
  cause?: unknown;
  /** Worker session ID */
  sessionId?: string;
  /** Connection ID */
  connectionId?: string;
};

// ========================================================================
// Constants
// ========================================================================

/**
 * Set of local embedding worker failure codes.
 */
const LOCAL_EMBEDDING_WORKER_FAILURE_CODES = new Set<string>(
  Object.values(LOCAL_EMBEDDING_WORKER_ERROR_CODES),
);

/**
 * Set of Oracle local worker failure codes.
 */
const ORACLE_LOCAL_WORKER_FAILURE_CODES = new Set<string>(
  Object.values(ORACLE_LOCAL_WORKER_ERROR_CODES),
);

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Checks if error is a local embedding worker failure.
 * 
 * @param err - Error to check
 * @returns True if local embedding worker failure
 * 
 * @example
 * ```typescript
 * if (isLocalEmbeddingWorkerFailure(error)) {
 *   // Handle worker failure
 *   console.log('Worker failed with code:', error.code);
 *   // Try to restart worker
 *   await restartWorker();
 * }
 * ```
 */
export function isLocalEmbeddingWorkerFailure(
  err: unknown,
): err is LocalEmbeddingWorkerFailureError {
  return (
    err instanceof Error &&
    LOCAL_EMBEDDING_WORKER_FAILURE_CODES.has(String((err as { code?: unknown }).code))
  );
}

/**
 * Checks if error is an Oracle local worker failure.
 * 
 * @param err - Error to check
 * @returns True if Oracle local worker failure
 * 
 * @example
 * ```typescript
 * if (isOracleLocalWorkerFailure(error)) {
 *   // Handle Oracle-specific worker failure
 *   console.log('Oracle worker failed:', error.oracleCode);
 *   // Check Oracle connection
 *   await reconnectOracle();
 * }
 * ```
 */
export function isOracleLocalWorkerFailure(
  err: unknown,
): err is OracleLocalWorkerFailureError {
  return (
    err instanceof Error &&
    ORACLE_LOCAL_WORKER_FAILURE_CODES.has(String((err as { code?: unknown }).code))
  );
}

/**
 * Creates a local embedding worker failure error.
 * 
 * @param params - Error parameters
 * @param params.code - Error code
 * @param params.message - Error message
 * @param params.oracleCode - Oracle-specific error code
 * @param params.oracleError - Original Oracle error
 * @param params.cause - Original cause
 * @returns Local embedding worker failure error
 * 
 * @example
 * ```typescript
 * const error = createLocalEmbeddingWorkerFailure({
 *   code: 'LOCAL_EMBEDDING_WORKER_EXITED',
 *   message: 'Worker exited unexpectedly',
 *   oracleCode: 'ORACLE_WORKER_CONNECTION_LOST',
 *   cause: originalError
 * });
 * throw error;
 * ```
 */
export function createLocalEmbeddingWorkerFailure(params: {
  code: LocalEmbeddingWorkerFailureCode;
  message: string;
  oracleCode?: OracleLocalWorkerFailureCode;
  oracleError?: any;
  cause?: unknown;
}): LocalEmbeddingWorkerFailureError {
  const error = new Error(params.message) as LocalEmbeddingWorkerFailureError;
  error.code = params.code;
  error.oracleCode = params.oracleCode;
  error.oracleError = params.oracleError;
  error.cause = params.cause;
  return error;
}

/**
 * Creates an Oracle local worker failure error.
 * 
 * @param params - Error parameters
 * @param params.code - Error code
 * @param params.message - Error message
 * @param params.cause - Original cause
 * @param params.sessionId - Worker session ID
 * @param params.connectionId - Connection ID
 * @returns Oracle local worker failure error
 * 
 * @example
 * ```typescript
 * const error = createOracleLocalWorkerFailure({
 *   code: 'ORACLE_WORKER_CONNECTION_LOST',
 *   message: 'Oracle connection lost',
 *   cause: originalError,
 *   sessionId: 'session-123',
 *   connectionId: 'conn-456'
 * });
 * throw error;
 * ```
 */
export function createOracleLocalWorkerFailure(params: {
  code: OracleLocalWorkerFailureCode;
  message: string;
  cause?: unknown;
  sessionId?: string;
  connectionId?: string;
}): OracleLocalWorkerFailureError {
  const error = new Error(params.message) as OracleLocalWorkerFailureError;
  error.code = params.code;
  error.cause = params.cause;
  error.sessionId = params.sessionId;
  error.connectionId = params.connectionId;
  return error;
}

/**
 * Gets error code from local embedding worker failure.
 * 
 * @param err - Error to inspect
 * @returns Error code or null
 * 
 * @example
 * ```typescript
 * const code = getLocalEmbeddingWorkerFailureCode(error);
 * if (code === 'LOCAL_EMBEDDING_WORKER_EXITED') {
 *   // Handle worker exit
 * }
 * ```
 */
export function getLocalEmbeddingWorkerFailureCode(
  err: unknown
): LocalEmbeddingWorkerFailureCode | null {
  if (!isLocalEmbeddingWorkerFailure(err)) {
    return null;
  }
  return err.code;
}

/**
 * Gets Oracle error code from local worker failure.
 * 
 * @param err - Error to inspect
 * @returns Oracle error code or null
 * 
 * @example
 * ```typescript
 * const oracleCode = getOracleLocalWorkerFailureCode(error);
 * if (oracleCode === 'ORACLE_WORKER_CONNECTION_LOST') {
 *   // Handle connection loss
 * }
 * ```
 */
export function getOracleLocalWorkerFailureCode(
  err: unknown
): OracleLocalWorkerFailureCode | null {
  if (!isOracleLocalWorkerFailure(err)) {
    return null;
  }
  return err.code;
}

/**
 * Checks if local embedding worker failure is retryable.
 * 
 * @param err - Error to check
 * @returns True if retryable
 * 
 * @example
 * ```typescript
 * if (isLocalEmbeddingWorkerFailureRetryable(error)) {
 *   await retryWorker();
 * } else {
 *   await restartWorker();
 * }
 * ```
 */
export function isLocalEmbeddingWorkerFailureRetryable(
  err: unknown
): boolean {
  if (!isLocalEmbeddingWorkerFailure(err)) {
    return false;
  }
  
  const code = err.code;
  
  // Retryable codes
  return [
    'LOCAL_EMBEDDING_WORKER_IPC_ERROR',
    'LOCAL_EMBEDDING_WORKER_TIMEOUT',
  ].includes(code);
}

/**
 * Checks if Oracle local worker failure is connection-related.
 * 
 * @param err - Error to check
 * @returns True if connection-related
 * 
 * @example
 * ```typescript
 * if (isOracleLocalWorkerConnectionError(error)) {
 *   // Reconnect to Oracle
 *   await reconnectOracle();
 * }
 * ```
 */
export function isOracleLocalWorkerConnectionError(
  err: unknown
): boolean {
  if (!isOracleLocalWorkerFailure(err)) {
    return false;
  }
  
  const code = err.code;
  
  // Connection-related codes
  return [
    'ORACLE_WORKER_CONNECTION_LOST',
    'ORACLE_WORKER_POOL_EXHAUSTED',
  ].includes(code);
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Constants
  LOCAL_EMBEDDING_WORKER_ERROR_CODES,
  ORACLE_LOCAL_WORKER_ERROR_CODES,
  
  // Core functions
  isLocalEmbeddingWorkerFailure,
  isOracleLocalWorkerFailure,
  createLocalEmbeddingWorkerFailure,
  createOracleLocalWorkerFailure,
  
  // Helpers
  getLocalEmbeddingWorkerFailureCode,
  getOracleLocalWorkerFailureCode,
  isLocalEmbeddingWorkerFailureRetryable,
  isOracleLocalWorkerConnectionError
};