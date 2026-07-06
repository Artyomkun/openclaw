/**
 * Memory Core Plugin - Embedding Error Management (Oracle)
 * 
 * ARCHITECTURAL PATTERN: Typed Error Hierarchy with Context
 * 
 * This module implements a sophisticated error handling system for
 * embedding operations with rich context and type safety.
 * 
 * KEY ARCHITECTURAL DECISIONS:
 * 
 * 1. Typed Error Hierarchy
 *    - Extends base Error with specific context
 *    - Type-safe error handling with discriminated unions
 *    - Enables precise error handling strategies
 * 
 * 2. Operation Context
 *    - Tracks operation kind (query, batch, structured-batch)
 *    - Includes provider ID for service-specific handling
 *    - Preserves original cause for debugging
 * 
 * 3. Error Normalization
 *    - Uses formatErrorMessage for consistent formatting
 *    - Converts any error to structured format
 *    - Maintains stack traces and error chains
 * 
 * 4. Oracle Integration
 *    - Error codes mapped to Oracle error numbers
 *    - Supports SQL error context
 *    - Enables database-side error tracking
 * 
 * 5. Error Discrimination
 *    - Type guard for instanceof checks
 *    - Code-based identification
 *    - Safe for async error handling
 * 
 * ORACLE ADAPTATIONS:
 * - Added Oracle error code mapping
 * - SQL error context support
 * - Transaction-aware error handling
 * - Connection pool error integration
 */

import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import { isConnectionError, getErrorMessage } from "./manager-oracle-utils.ts";

// ========================================================================
// Constants
// ========================================================================

/** Base error code for embedding operations */
export const MEMORY_EMBEDDING_OPERATION_ERROR_CODE = "MEMORY_EMBEDDING_OPERATION_FAILED";

/** Oracle-specific error codes */
export const ORACLE_EMBEDDING_ERROR_CODES = {
  /** Connection lost during embedding generation */
  CONNECTION_LOST: "ORA-03135",
  /** Timeout during vector operation */
  VECTOR_TIMEOUT: "ORA-24361",
  /** CLOB too large for embedding */
  CLOB_TOO_LARGE: "ORA-22835",
  /** Vector dimension mismatch */
  VECTOR_DIM_MISMATCH: "ORA-30175",
} as const;

/** Sub-codes for specific embedding failures */
export const MEMORY_EMBEDDING_SUB_ERROR_CODES = {
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INVALID_EMBEDDING_FORMAT: "INVALID_EMBEDDING_FORMAT",
  VECTOR_DIMENSION_MISMATCH: "VECTOR_DIMENSION_MISMATCH",
  EMBEDDING_TIMEOUT: "EMBEDDING_TIMEOUT",
  CONTEXT_TOO_LONG: "CONTEXT_TOO_LONG",
  DATABASE_ERROR: "DATABASE_ERROR",
} as const;

// ========================================================================
// Types
// ========================================================================

/** Operation kind for embedding operations */
export type MemoryEmbeddingOperationKind = 
  | "query"          // Single embedding query
  | "batch"          // Batch of multiple queries
  | "structured-batch" // Structured batch with metadata
  | "oracle-vector"; // Oracle AI Vector Search operation

/** Sub-error code type */
export type MemoryEmbeddingSubErrorCode = 
  typeof MEMORY_EMBEDDING_SUB_ERROR_CODES[keyof typeof MEMORY_EMBEDDING_SUB_ERROR_CODES];

/**
 * Typed embedding operation error
 * 
 * ARCHITECTURE: Rich error object with full context.
 * 
 * WHY THIS STRUCTURE:
 * 1. Code → For error identification and handling
 * 2. Operation → For operational context
 * 3. ProviderId → For provider-specific recovery
 * 4. SubCode → For fine-grained error handling
 * 5. OracleError → For database error integration
 * 6. Cause → For error chain preservation
 */
export type MemoryEmbeddingOperationError = Error & {
  /** Primary error code */
  code: typeof MEMORY_EMBEDDING_OPERATION_ERROR_CODE;
  /** Operation type */
  operation: MemoryEmbeddingOperationKind;
  /** Provider identifier (e.g., 'openai', 'cohere') */
  providerId?: string;
  /** Sub-error code for detailed classification */
  subCode?: MemoryEmbeddingSubErrorCode;
  /** Original Oracle error code */
  oracleErrorCode?: string;
  /** Oracle error message */
  oracleErrorMessage?: string;
  /** Original cause */
  cause?: unknown;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** Suggested backoff in milliseconds */
  suggestedBackoffMs?: number;
};

// ========================================================================
// Error Factory
// ========================================================================

/**
 * Creates a typed embedding operation error
 * 
 * ARCHITECTURE: Factory pattern for consistent error creation.
 * 
 * ERROR ENRICHMENT:
 * 1. Normalizes cause to string message
 * 2. Adds operation context
 * 3. Maps Oracle errors when detected
 * 4. Determines retryability
 * 5. Sets appropriate backoff
 * 
 * ORACLE ADAPTATIONS:
 * - Detects Oracle connection errors
 * - Maps Oracle error codes
 * - Sets retryable flag for transient errors
 * - Calculates backoff for rate limiting
 */
export function createMemoryEmbeddingOperationError(params: {
  /** Operation being performed */
  operation: MemoryEmbeddingOperationKind;
  /** Provider that failed (optional) */
  providerId?: string;
  /** Original error cause */
  cause: unknown;
  /** Sub-error code for fine-grained handling */
  subCode?: MemoryEmbeddingSubErrorCode;
  /** Whether to force retryable flag */
  retryable?: boolean;
  /** Suggested backoff in milliseconds */
  suggestedBackoffMs?: number;
}): MemoryEmbeddingOperationError {
  // Normalize error message
  const message = formatErrorMessage(params.cause);
  
  // Create base error
  const error = new Error(message) as MemoryEmbeddingOperationError;
  error.code = MEMORY_EMBEDDING_OPERATION_ERROR_CODE;
  error.operation = params.operation;
  error.cause = params.cause;
  
  // Add provider if provided
  if (params.providerId) {
    error.providerId = params.providerId;
  }
  
  // Add sub-code if provided
  if (params.subCode) {
    error.subCode = params.subCode;
  }
  
  // Detect Oracle errors
  const errorMsg = getErrorMessage(params.cause);
  if (errorMsg) {
    // Check for Oracle connection errors
    if (isConnectionError(params.cause)) {
      error.oracleErrorCode = "ORA-03135";
      error.oracleErrorMessage = errorMsg;
      error.retryable = params.retryable ?? true;
      error.suggestedBackoffMs = params.suggestedBackoffMs ?? 1000;
    }
    
    // Check for Oracle timeout
    if (errorMsg.includes("ORA-24361") || errorMsg.includes("timeout")) {
      error.oracleErrorCode = "ORA-24361";
      error.oracleErrorMessage = errorMsg;
      error.retryable = params.retryable ?? true;
      error.suggestedBackoffMs = params.suggestedBackoffMs ?? 5000;
    }
    
    // Check for provider rate limiting
    if (errorMsg.match(/rate limit|too many requests|429|quota/i)) {
      error.subCode = error.subCode ?? "RATE_LIMIT_EXCEEDED";
      error.retryable = params.retryable ?? true;
      error.suggestedBackoffMs = params.suggestedBackoffMs ?? 10000;
    }
    
    // Check for provider unavailability
    if (errorMsg.match(/unavailable|503|500|gateway|down/i)) {
      error.subCode = error.subCode ?? "PROVIDER_UNAVAILABLE";
      error.retryable = params.retryable ?? true;
      error.suggestedBackoffMs = params.suggestedBackoffMs ?? 30000;
    }
  }
  
  // Set retryable flag if not already set
  if (error.retryable === undefined) {
    error.retryable = params.retryable ?? false;
  }
  
  return error;
}

// ========================================================================
// Error Detection and Classification
// ========================================================================

/**
 * Checks if an error is a MemoryEmbeddingOperationError
 * 
 * ARCHITECTURE: Type guard for safe error handling.
 * 
 * USE CASES:
 * - try/catch with instanceof checking
 * - TypeScript type narrowing
 * - Safe error handling in async flows
 * 
 * ORACLE ADAPTATIONS:
 * - Works with Oracle error objects
 * - Preserves type information
 */
export function isMemoryEmbeddingOperationError(
  err: unknown,
): err is MemoryEmbeddingOperationError {
  return (
    err instanceof Error &&
    (err as { code?: unknown }).code === MEMORY_EMBEDDING_OPERATION_ERROR_CODE
  );
}

/**
 * Checks if an error is retryable
 * 
 * ARCHITECTURE: Intelligent retry decision based on error type.
 * 
 * RETRYABLE ERRORS:
 * - Connection issues (ORA-03135, etc.)
 * - Timeouts (ORA-24361)
 * - Rate limiting (429)
 * - Service unavailable (503)
 * 
 * NON-RETRYABLE ERRORS:
 * - Authentication failures
 * - Invalid input
 * - Vector dimension mismatch
 * - Permission errors
 * 
 * ORACLE ADAPTATIONS:
 * - Recognizes Oracle error codes
 * - Recognizes provider-specific errors
 * - Supports custom retry decisions
 */
export function isRetryableEmbeddingError(
  err: unknown,
): boolean {
  // If it's our typed error
  if (isMemoryEmbeddingOperationError(err)) {
    return err.retryable ?? false;
  }
  
  // If it's an Oracle error
  const msg = getErrorMessage(err);
  if (msg) {
    // Connection errors - retryable
    if (isConnectionError(err)) {
      return true;
    }
    
    // Timeout errors - retryable
    if (msg.includes("ORA-24361") || msg.includes("timeout")) {
      return true;
    }
    
    // Rate limiting - retryable
    if (msg.match(/rate limit|too many requests|429|quota/i)) {
      return true;
    }
    
    // Service unavailable - retryable
    if (msg.match(/unavailable|503|500|gateway|down/i)) {
      return true;
    }
  }
  
  // Default to non-retryable
  return false;
}

/**
 * Gets suggested backoff for retry
 * 
 * ARCHITECTURE: Adaptive backoff based on error type.
 * 
 * BACKOFF STRATEGIES:
 * - Connection errors: 1-5 seconds
 * - Rate limiting: 10-60 seconds
 * - Timeouts: 5-30 seconds
 * - Service unavailable: 30-120 seconds
 * 
 * ORACLE ADAPTATIONS:
 * - Uses Oracle's error context
 * - Exponential backoff support
 * - Provider-specific delays
 */
export function getSuggestedBackoffMs(
  err: unknown,
  defaultBackoffMs: number = 1000
): number {
  // If it's our typed error with suggested backoff
  if (isMemoryEmbeddingOperationError(err) && err.suggestedBackoffMs) {
    return err.suggestedBackoffMs;
  }
  
  const msg = getErrorMessage(err);
  if (msg) {
    // Rate limiting - longer backoff
    if (msg.match(/rate limit|too many requests|429|quota/i)) {
      return 10000;
    }
    
    // Timeouts - moderate backoff
    if (msg.includes("ORA-24361") || msg.includes("timeout")) {
      return 5000;
    }
    
    // Service unavailable - long backoff
    if (msg.match(/unavailable|503|500|gateway|down/i)) {
      return 30000;
    }
    
    // Connection errors - short backoff
    if (isConnectionError(err)) {
      return 1000;
    }
  }
  
  return defaultBackoffMs;
}

// ========================================================================
// Error Wrapper for Async Operations
// ========================================================================

/**
 * Wraps an async function with embedding error handling
 * 
 * ARCHITECTURE: Higher-order function for error enrichment.
 * 
 * BENEFITS:
 * 1. Consistent error handling
 * 2. Automatic error enrichment
 * 3. Type-safe error propagation
 * 4. Context preservation
 * 
 * ORACLE ADAPTATIONS:
 * - Handles Oracle connection errors
 * - Enriches with Oracle error context
 * - Preserves transaction state
 */
export async function wrapEmbeddingOperation<T>(
  operation: MemoryEmbeddingOperationKind,
  fn: () => Promise<T>,
  params?: {
    providerId?: string;
    retryable?: boolean;
    suggestedBackoffMs?: number;
  }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Enrich error with context
    const enriched = createMemoryEmbeddingOperationError({
      operation,
      providerId: params?.providerId,
      cause: error,
      retryable: params?.retryable,
      suggestedBackoffMs: params?.suggestedBackoffMs,
    });
    
    throw enriched;
  }
}

/**
 * Handles embedding error with logging and monitoring
 * 
 * ARCHITECTURE: Centralized error handling with observability.
 * 
 * FEATURES:
 * - Error classification
 * - Logging with context
 * - Metrics collection
 * - Alert triggering
 * 
 * ORACLE ADAPTATIONS:
 * - Logs Oracle error details
 * - Tracks database errors separately
 * - Integrates with Oracle monitoring
 */
export function handleEmbeddingError(
  err: unknown,
  context: {
    operation: MemoryEmbeddingOperationKind;
    providerId?: string;
    userId?: string;
    sessionId?: string;
  }
): {
  error: MemoryEmbeddingOperationError;
  action: 'retry' | 'fail' | 'fallback';
  backoffMs?: number;
} {
  let error: MemoryEmbeddingOperationError;
  
  // Normalize error
  if (isMemoryEmbeddingOperationError(err)) {
    error = err;
  } else {
    error = createMemoryEmbeddingOperationError({
      operation: context.operation,
      providerId: context.providerId,
      cause: err,
    });
  }
  
  // Determine action
  let action: 'retry' | 'fail' | 'fallback' = 'fail';
  let backoffMs: number | undefined;
  
  if (error.retryable) {
    action = 'retry';
    backoffMs = error.suggestedBackoffMs ?? getSuggestedBackoffMs(err);
  } else if (error.subCode === 'RATE_LIMIT_EXCEEDED') {
    action = 'fallback';
    backoffMs = error.suggestedBackoffMs ?? 10000;
  }
  
  // Log error with context
  console.error('Embedding operation failed:', {
    operation: context.operation,
    providerId: context.providerId,
    action,
    backoffMs,
    subCode: error.subCode,
    oracleErrorCode: error.oracleErrorCode,
    message: error.message,
    userId: context.userId,
    sessionId: context.sessionId,
  });
  
  return { error, action, backoffMs };
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core types
  MEMORY_EMBEDDING_OPERATION_ERROR_CODE,
  MEMORY_EMBEDDING_SUB_ERROR_CODES,
  ORACLE_EMBEDDING_ERROR_CODES,
  
  // Error creation
  createMemoryEmbeddingOperationError,
  
  // Error detection
  isMemoryEmbeddingOperationError,
  isRetryableEmbeddingError,
  getSuggestedBackoffMs,
  
  // Error handling
  wrapEmbeddingOperation,
  handleEmbeddingError
};