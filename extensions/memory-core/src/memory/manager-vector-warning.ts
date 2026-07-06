/**
 * Memory Core Plugin - Oracle Vector Warning Module
 * 
 * Handles degraded vector write warnings for Oracle.
 * 
 * ARCHITECTURE:
 * - Warns when vector storage is degraded
 * - Suppresses duplicate warnings
 * - Provides clear error context
 * - Oracle-specific error messages
 * 
 * ORACLE ADAPTATIONS:
 * - Oracle AI Vector Search unavailable warnings
 * - Oracle Text degradation warnings
 * - Connection pool warnings
 * - CLOB/BLOB storage fallback warnings
 */

// ========================================================================
// Types
// ========================================================================

/**
 * Vector degradation context for Oracle.
 */
export interface VectorDegradationContext {
  /** Whether vector storage is enabled */
  vectorEnabled: boolean;
  /** Whether vector storage is ready */
  vectorReady: boolean;
  /** Number of chunks being processed */
  chunkCount: number;
  /** Whether warning has already been shown */
  warningShown: boolean;
  /** Load error message if any */
  loadError?: string;
  /** Oracle-specific error details */
  oracleError?: {
    code?: string;
    message?: string;
    errorNum?: number;
  };
  /** Storage mode being used */
  storageMode?: 'ai-vector' | 'json' | 'blob' | 'clob' | 'none';
  /** Warning callback */
  warn: (message: string) => void;
}

/**
 * Vector degradation type.
 */
export type VectorDegradationType = 
  | 'ai-vector-unavailable'
  | 'extension-not-loaded'
  | 'dimension-mismatch'
  | 'storage-fallback'
  | 'oracle-error'
  | 'connection-error'
  | 'timeout';

// ========================================================================
// Format Functions
// ========================================================================

/**
 * Formats vector degraded write reason.
 * 
 * @param loadError - Error message from vector load
 * @param oracleError - Oracle-specific error
 * @param storageMode - Current storage mode
 * @returns Formatted error message
 */
export function formatMemoryVectorDegradedWriteReason(
  loadError?: string,
  oracleError?: { code?: string; message?: string; errorNum?: number },
  storageMode: string = 'none'
): string {
  if (oracleError) {
    // Oracle-specific errors
    if (oracleError.errorNum === 600) {
      return `Oracle AI Vector Search unavailable: internal error (ORA-00600) - ${oracleError.message || 'unknown'}`;
    }
    if (oracleError.errorNum === 22835) {
      return `Oracle AI Vector Search unavailable: CLOB too large (ORA-22835) - ${oracleError.message || 'vector dimension exceeds limit'}`;
    }
    if (oracleError.errorNum === 30175) {
      return `Oracle AI Vector Search unavailable: invalid vector type (ORA-30175) - ${oracleError.message || 'dimension mismatch'}`;
    }
    if (oracleError.code === 'ORA-03135') {
      return `Oracle AI Vector Search unavailable: connection lost (ORA-03135) - vector storage degraded`;
    }
    if (oracleError.code?.startsWith('ORA-')) {
      return `Oracle AI Vector Search unavailable: ${oracleError.code} - ${oracleError.message || 'unknown Oracle error'}`;
    }
  }

  if (loadError) {
    return `Oracle vector storage degraded: ${loadError}`;
  }

  if (storageMode === 'none') {
    return 'Oracle AI Vector Search unavailable — no vector storage mode configured';
  }

  if (storageMode === 'ai-vector') {
    return 'Oracle AI Vector Search unavailable — falling back to JSON storage';
  }

  if (storageMode === 'json' || storageMode === 'clob') {
    return `Vector storage degraded — using ${storageMode.toUpperCase()} storage instead of Oracle AI Vector Search`;
  }

  return 'Oracle vector storage degraded — semantic vector embeddings unavailable';
}

/**
 * Gets degradation type from error.
 */
export function getVectorDegradationType(
  error?: Error | unknown,
  loadError?: string
): VectorDegradationType {
  if (!error && !loadError) {
    return 'ai-vector-unavailable';
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const fullMessage = errorMessage + (loadError || '');

  if (fullMessage.includes('ORA-03135') || fullMessage.includes('connection')) {
    return 'connection-error';
  }

  if (fullMessage.includes('ORA-22835') || fullMessage.includes('CLOB')) {
    return 'dimension-mismatch';
  }

  if (fullMessage.includes('ORA-30175') || fullMessage.includes('VECTOR')) {
    return 'dimension-mismatch';
  }

  if (fullMessage.includes('timeout') || fullMessage.includes('ORA-24361')) {
    return 'timeout';
  }

  if (fullMessage.includes('fallback')) {
    return 'storage-fallback';
  }

  return 'oracle-error';
}

// ========================================================================
// Log Functions
// ========================================================================

/**
 * Logs vector degraded write warning.
 * 
 * @param params - Warning parameters
 * @returns Whether warning was shown
 * 
 * @example
 * ```typescript
 * const warningShown = logMemoryVectorDegradedWrite({
 *   vectorEnabled: true,
 *   vectorReady: false,
 *   chunkCount: 10,
 *   warningShown: false,
 *   loadError: 'Connection failed',
 *   oracleError: { errorNum: 3135, message: 'ORA-03135: connection lost' },
 *   warn: (msg) => console.warn(msg)
 * });
 * ```
 */
export function logMemoryVectorDegradedWrite(params: VectorDegradationContext): boolean {
  // Early exit: no warning needed
  if (!params.vectorEnabled) {
    return params.warningShown;
  }

  if (params.vectorReady) {
    return params.warningShown;
  }

  if (params.chunkCount <= 0) {
    return params.warningShown;
  }

  if (params.warningShown) {
    return params.warningShown;
  }

  // Build warning message
  const reason = formatMemoryVectorDegradedWriteReason(
    params.loadError,
    params.oracleError,
    params.storageMode
  );

  let message = `Oracle vector storage degraded — ${reason}.`;

  // Add context
  if (params.storageMode === 'ai-vector') {
    message += ' Using JSON fallback storage.';
  }

  if (params.storageMode === 'json' || params.storageMode === 'clob') {
    message += ` Using ${params.storageMode.toUpperCase()} storage.`;
  }

  if (params.oracleError?.errorNum) {
    message += ` Oracle error: ${params.oracleError.errorNum}.`;
  }

  message += ' Vector recall degraded. Further duplicate warnings suppressed.';

  // Log warning
  params.warn(message);

  return true;
}

/**
 * Logs vector degraded write warning with full Oracle context.
 * 
 * @param params - Extended warning parameters
 * @returns Whether warning was shown
 */
export function logMemoryVectorDegradedWriteDetailed(params: VectorDegradationContext & {
  error?: unknown;
  timestamp?: number;
  operation?: string;
}): boolean {
  // Early exit
  if (!params.vectorEnabled || params.vectorReady || params.chunkCount <= 0 || params.warningShown) {
    return params.warningShown;
  }

  const reason = formatMemoryVectorDegradedWriteReason(
    params.loadError,
    params.oracleError,
    params.storageMode
  );

  const degradationType = getVectorDegradationType(params.error, params.loadError);
  const timestamp = params.timestamp ?? Date.now();
  const operation = params.operation ?? 'unknown';

  let message = `Oracle vector storage degraded (${degradationType}) — ${reason}.`;

  if (params.oracleError) {
    message += ` Oracle: ${params.oracleError.code || params.oracleError.errorNum || 'unknown'} - ${params.oracleError.message || 'no message'}.`;
  }

  if (params.error) {
    const errorMsg = params.error instanceof Error ? params.error.message : String(params.error);
    if (errorMsg && !errorMsg.includes(params.loadError || '')) {
      message += ` Error: ${errorMsg.substring(0, 200)}.`;
    }
  }

  message += ` Operation: ${operation}.`;
  message += ` Chunks: ${params.chunkCount}.`;
  message += ` Storage: ${params.storageMode || 'unknown'}.`;
  message += ' Further duplicate warnings suppressed.';

  params.warn(message);

  return true;
}

// ========================================================================
// Suppression Helpers
// ========================================================================

/**
 * Check if warning should be suppressed.
 */
export function shouldSuppressVectorWarning(params: {
  warningShown: boolean;
  vectorReady: boolean;
  vectorEnabled: boolean;
  chunkCount: number;
}): boolean {
  return (
    !params.vectorEnabled ||
    params.vectorReady ||
    params.chunkCount <= 0 ||
    params.warningShown
  );
}

/**
 * Creates a warning suppressor for repeated calls.
 * 
 * @param warnFn - Warning function
 * @returns Suppressor function
 * 
 * @example
 * ```typescript
 * const warn = createVectorWarningSuppressor(console.warn);
 * 
 * warn({ vectorEnabled: true, vectorReady: false, chunkCount: 5 });
 * // Shows warning once
 * warn({ vectorEnabled: true, vectorReady: false, chunkCount: 5 });
 * // Suppressed
 * ```
 */
export function createVectorWarningSuppressor(
  warnFn: (message: string) => void
): (context: Omit<VectorDegradationContext, 'warn'>) => boolean {
  let shown = false;

  return (context): boolean => {
    if (shown) {
      return true;
    }

    const result = logMemoryVectorDegradedWrite({
      ...context,
      warn: warnFn,
      warningShown: false,
    });

    shown = result;
    return result;
  };
}

// ========================================================================
// Oracle-Specific Helpers
// ========================================================================

/**
 * Checks if vector degradation is due to Oracle AI Vector Search unavailability.
 */
export function isOracleAIVectorUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as any;

  // Check for Oracle AI Vector Search errors
  if (err.errorNum === 600) return true; // ORA-00600
  if (err.errorNum === 22835) return true; // ORA-22835
  if (err.errorNum === 30175) return true; // ORA-30175

  // Check for connection errors
  if (err.errorNum === 3135) return true; // ORA-03135
  if (err.errorNum === 3113) return true; // ORA-03113

  // Check error message
  const msg = String(err.message || '');
  return (
    msg.includes('VECTOR') ||
    msg.includes('AI Vector Search') ||
    msg.includes('vector type') ||
    msg.includes('vector dimension')
  );
}

/**
 * Gets Oracle-specific vector storage status.
 */
export function getOracleVectorStatus(params: {
  vectorEnabled: boolean;
  vectorReady: boolean;
  loadError?: string;
  oracleError?: { code?: string; errorNum?: number };
  storageMode?: string;
}): {
  status: 'ok' | 'degraded' | 'unavailable';
  reason: string;
  recommendation: string;
} {
  if (!params.vectorEnabled) {
    return {
      status: 'unavailable',
      reason: 'Vector storage is disabled',
      recommendation: 'Enable vector storage in configuration',
    };
  }

  if (params.vectorReady) {
    return {
      status: 'ok',
      reason: 'Vector storage is ready',
      recommendation: 'None needed',
    };
  }

  // Check for Oracle-specific issues
  if (params.oracleError) {
    const err = params.oracleError;
    if (err.errorNum === 600) {
      return {
        status: 'unavailable',
        reason: 'Oracle AI Vector Search internal error (ORA-00600)',
        recommendation: 'Check Oracle AI Vector Search installation or contact DBA',
      };
    }
    if (err.errorNum === 22835) {
      return {
        status: 'degraded',
        reason: 'Vector dimension too large for CLOB storage',
        recommendation: 'Reduce vector dimension or use BLOB storage',
      };
    }
    if (err.errorNum === 3135) {
      return {
        status: 'degraded',
        reason: 'Oracle connection lost',
        recommendation: 'Check network connectivity and connection pool settings',
      };
    }
  }

  // Fallback based on storage mode
  if (params.storageMode === 'json' || params.storageMode === 'clob') {
    return {
      status: 'degraded',
      reason: `Using ${params.storageMode.toUpperCase()} storage instead of AI Vector Search`,
      recommendation: 'Upgrade to Oracle 23ai+ for AI Vector Search support',
    };
  }

  return {
    status: 'unavailable',
    reason: params.loadError || 'Vector storage unavailable',
    recommendation: 'Check Oracle AI Vector Search installation and configuration',
  };
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  formatMemoryVectorDegradedWriteReason,
  logMemoryVectorDegradedWrite,
  logMemoryVectorDegradedWriteDetailed,

  // Helpers
  shouldSuppressVectorWarning,
  createVectorWarningSuppressor,
  getVectorDegradationType,

  // Oracle-specific
  isOracleAIVectorUnavailableError,
  getOracleVectorStatus,
};