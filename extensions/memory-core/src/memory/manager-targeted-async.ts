/**
 * Memory Core Plugin - Oracle Targeted Sync Module
 * 
 * ASYNC-READY targeted session synchronization for Oracle.
 * NO ERROR SWALLOWING!
 */

import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import type { MemorySyncProgressUpdate } from "openclaw/plugin-sdk/memory-core-host-engine-storage";

// ========================================================================
// Types
// ========================================================================

export type TargetedSyncProgress = {
  completed: number;
  total: number;
  label?: string;
  report: (update: MemorySyncProgressUpdate) => void;
};

export interface OracleTargetedSyncConfig {
  maxBatchSize?: number;
  maxConcurrency?: number;
  useTransactions?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface OracleSyncErrorDetails {
  code?: string;
  errorNum?: number;
  message: string;
  file?: string;
  sql?: string;
  rollbackError?: string;
}

// ========================================================================
// Custom Errors
// ========================================================================

export class TargetedSyncError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly file?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TargetedSyncError';
  }
}

export class OracleSyncError extends TargetedSyncError {
  constructor(
    message: string,
    public readonly oracleError?: OracleSyncErrorDetails,
    file?: string,
    cause?: unknown
  ) {
    super(
      `Oracle sync failed: ${message}${oracleError ? ` (${oracleError.code || oracleError.errorNum || 'unknown'})` : ''}`,
      'ORACLE_SYNC_ERROR',
      file,
      cause
    );
    this.name = 'OracleSyncError';
  }
}

export class OracleRollbackError extends OracleSyncError {
  constructor(
    message: string,
    public readonly originalError: unknown,
    oracleError?: OracleSyncErrorDetails,
    file?: string
  ) {
    super(
      `Rollback failed after transaction error: ${message}`,
      oracleError,
      file,
      originalError
    );
    this.name = 'OracleRollbackError';
  }
}

// ========================================================================
// Utility Functions
// ========================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isOracleConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as any;
  const errorNum = err.errorNum || err.code;
  if (typeof errorNum === 'number') {
    return [3135, 3113, 3114, 1033, 1034, 1041, 1089, 25408].includes(errorNum);
  }
  const msg = String(err.message || '');
  return /ORA-03135|ORA-03113|ORA-03114|ORA-01033|ORA-01034|ORA-01089|ORA-25408|connection lost|TNS|network timeout/i.test(msg);
}

function isOracleDeadlockError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as any;
  const errorNum = err.errorNum || err.code;
  if (typeof errorNum === 'number') {
    return errorNum === 60;
  }
  const msg = String(err.message || '');
  return /ORA-00060|deadlock/i.test(msg);
}

function isOracleTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as any;
  const errorNum = err.errorNum || err.code;
  if (typeof errorNum === 'number') {
    return [24361, 25408, 25228].includes(errorNum);
  }
  const msg = String(err.message || '');
  return /ORA-24361|ORA-25408|ORA-25228|timeout/i.test(msg);
}

function getOracleErrorDetails(error: unknown): OracleSyncErrorDetails | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const err = error as any;
  return {
    code: err.code,
    errorNum: err.errorNum,
    message: err.message || String(error),
    file: err.file,
    sql: err.sql,
  };
}

// ========================================================================
// Core Functions
// ========================================================================

export async function clearMemorySyncedSessionFiles(params: {
  sessionsDirtyFiles: Set<string>;
  targetSessionFiles?: Iterable<string> | null;
}): Promise<boolean> {
  if (!params.targetSessionFiles) {
    params.sessionsDirtyFiles.clear();
  } else {
    for (const targetSessionFile of params.targetSessionFiles) {
      params.sessionsDirtyFiles.delete(targetSessionFile);
    }
  }
  return params.sessionsDirtyFiles.size > 0;
}

export async function markMemoryTargetSessionFilesDirty(params: {
  sessionsDirtyFiles: Set<string>;
  targetSessionFiles?: Iterable<string> | null;
}): Promise<boolean> {
  if (params.targetSessionFiles) {
    for (const targetSessionFile of params.targetSessionFiles) {
      params.sessionsDirtyFiles.add(targetSessionFile);
    }
  }
  return params.sessionsDirtyFiles.size > 0;
}

// ========================================================================
// Oracle Transaction Helper - NO ERROR SWALLOWING!
// ========================================================================

/**
 * Executes a sync operation with Oracle transaction support.
 * Proper error handling - no swallowed errors!
 */
export async function withOracleTransaction<T>(params: {
  db: any;
  operation: (conn: any) => Promise<T>;
  useTransaction?: boolean;
  savepointName?: string;
  timeoutMs?: number;
  onRollbackError?: (error: unknown) => void;
}): Promise<T> {
  const useTransaction = params.useTransaction ?? true;
  const timeoutMs = params.timeoutMs ?? 60000;

  if (!useTransaction) {
    return await params.operation(params.db);
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Transaction timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  let transactionStarted = false;
  let rollbackError: unknown = null;

  try {
    // Start transaction
    await params.db.execute('BEGIN');
    transactionStarted = true;

    // Create savepoint if provided
    if (params.savepointName) {
      await params.db.execute(`SAVEPOINT ${params.savepointName}`);
    }

    // Execute operation with timeout
    const result = await Promise.race([
      params.operation(params.db),
      timeoutPromise,
    ]);

    // Commit transaction
    await params.db.execute('COMMIT');

    return result;

  } catch (error) {
    // Try rollback if transaction was started
    if (transactionStarted) {
      try {
        if (params.savepointName) {
          await params.db.execute(`ROLLBACK TO SAVEPOINT ${params.savepointName}`);
        } else {
          await params.db.execute('ROLLBACK');
        }
      } catch (rollbackErr) {
        // НЕ ПРОГЛАТЫВАЕМ! Сохраняем ошибку отката
        rollbackError = rollbackErr;
        
        // Вызываем колбэк если передан
        if (params.onRollbackError) {
          await params.onRollbackError(rollbackErr);
        }

        // Создаём детальную ошибку с информацией об откате
        const rollbackDetails = getOracleErrorDetails(rollbackErr);
        const originalDetails = getOracleErrorDetails(error);

        // Бросаем ошибку с контекстом
        throw new OracleRollbackError(
          `Transaction failed: ${formatErrorMessage(error)}. Rollback also failed: ${formatErrorMessage(rollbackErr)}`,
          error,
          {
            ...originalDetails,
            rollbackError: formatErrorMessage(rollbackErr),
          },
          undefined
        );
      }
    }

    // Если откат не нужен или не удался, пробрасываем исходную ошибку
    // Но добавляем контекст о том, что откат не выполнялся
    if (!rollbackError) {
      // Пересоздаём ошибку с контекстом
      const details = getOracleErrorDetails(error);
      const newError = new OracleSyncError(
        `Transaction failed: ${formatErrorMessage(error)}. Rollback was not performed.`,
        details,
        undefined,
        error
      );
      throw newError;
    }

    // Если rollbackError был, но мы его уже обработали, пробрасываем дальше
    throw error;
  }
}

// ========================================================================
// Main Sync Function - NO ERROR SWALLOWING!
// ========================================================================

export async function runMemoryTargetedSessionSync(params: {
  hasSessionSource: boolean;
  targetSessionFiles: Set<string> | null;
  reason?: string;
  progress?: TargetedSyncProgress;
  sessionsFullRetryDirty?: boolean;
  sessionsDirtyFiles: Set<string>;
  syncSessionFiles: (params: {
    needsFullReindex: boolean;
    targetSessionFiles?: string[];
    progress?: TargetedSyncProgress;
  }) => Promise<void>;
  shouldFallbackOnError: (err: unknown) => boolean;
  activateFallbackProvider: (reason: string) => Promise<boolean>;
  config?: OracleTargetedSyncConfig;
}): Promise<{
  handled: boolean;
  sessionsDirty: boolean;
  processedCount?: number;
  failedCount?: number;
  oracleErrors?: OracleSyncErrorDetails[];
}> {
  const config = {
    maxBatchSize: params.config?.maxBatchSize ?? 1000,
    maxConcurrency: params.config?.maxConcurrency ?? 5,
    useTransactions: params.config?.useTransactions ?? true,
    retryAttempts: params.config?.retryAttempts ?? 3,
    retryDelayMs: params.config?.retryDelayMs ?? 1000,
    timeoutMs: params.config?.timeoutMs ?? 60000,
  };

  // Early exit if no session source
  if (!params.hasSessionSource || !params.targetSessionFiles) {
    return {
      handled: false,
      sessionsDirty: Boolean(params.sessionsFullRetryDirty) || params.sessionsDirtyFiles.size > 0,
    };
  }

  const targetFiles = Array.from(params.targetSessionFiles);
  const totalFiles = targetFiles.length;
  const oracleErrors: OracleSyncErrorDetails[] = [];

  // Report initial progress
  if (params.progress) {
    params.progress.report({
      completed: 0,
      total: totalFiles,
      label: `Syncing ${totalFiles} session files${params.reason ? ` (${params.reason})` : ''}`,
      error: undefined,
    });
  }

  let processedCount = 0;
  let failedCount = 0;
  let remainingDirty = false;

  for (let i = 0; i < targetFiles.length; i += config.maxBatchSize) {
    const batch = targetFiles.slice(i, i + config.maxBatchSize);

    try {
      let lastError: unknown = null;
      let retryAttempt = 0;

      while (retryAttempt < config.retryAttempts) {
        try {
          // Use transaction wrapper
          await withOracleTransaction({
            db: params.syncSessionFiles,
            operation: async () => {
              await params.syncSessionFiles({
                needsFullReindex: false,
                targetSessionFiles: batch,
                progress: params.progress ? {
                  completed: processedCount,
                  total: totalFiles,
                  label: `Batch ${Math.floor(i / config.maxBatchSize) + 1}: ${batch.length} files`,
                  report: params.progress.report,
                } : undefined,
              });
            },
            useTransaction: config.useTransactions,
            timeoutMs: config.timeoutMs,
            onRollbackError: (rollbackErr) => {
              // Логируем ошибку отката, но не проглатываем
              console.error('Rollback failed:', rollbackErr);
              oracleErrors.push({
                message: `Rollback failed: ${formatErrorMessage(rollbackErr)}`,
                errorNum: (rollbackErr as any)?.errorNum,
                code: (rollbackErr as any)?.code,
              });
            },
          });

          // Success - clear dirty files
          for (const file of batch) {
            params.sessionsDirtyFiles.delete(file);
          }

          processedCount += batch.length;
          lastError = null;
          break;

        } catch (error) {
          lastError = error;

          const isRetryable = isOracleConnectionError(error) || 
                              isOracleDeadlockError(error) || 
                              isOracleTimeoutError(error);

          if (!isRetryable || retryAttempt >= config.retryAttempts - 1) {
            // Not retryable or out of attempts
            failedCount += batch.length;
            const oracleDetail = getOracleErrorDetails(error);
            if (oracleDetail) {
              oracleErrors.push(oracleDetail);
            }

            const errorMsg = formatErrorMessage(error);
            
            // Try fallback
            const fallbackActivated = params.shouldFallbackOnError(error) &&
              (await params.activateFallbackProvider(errorMsg));

            if (!fallbackActivated) {
              for (const file of batch) {
                params.sessionsDirtyFiles.add(file);
              }
              remainingDirty = true;

              // Бросаем детальную ошибку
              throw new OracleSyncError(
                `Batch ${Math.floor(i / config.maxBatchSize) + 1} failed after ${retryAttempt + 1} attempts: ${errorMsg}`,
                oracleDetail,
                batch[0],
                error
              );
            }

            // Fallback activated - continue with next batch
            retryAttempt = config.retryAttempts; // Exit retry loop
            break;
          }

          // Retry with backoff
          retryAttempt++;
          const delayMs = config.retryDelayMs * Math.pow(2, retryAttempt - 1);
          await sleep(delayMs);
        }
      }

      // If we still have an error after retries
      if (lastError) {
        // Already handled above
        continue;
      }

    } catch (error) {
      // Если ошибка уже содержит контекст, пробрасываем дальше
      if (error instanceof OracleSyncError || error instanceof OracleRollbackError) {
        throw error;
      }
      
      // Иначе оборачиваем
      const errorMsg = formatErrorMessage(error);
      const oracleDetail = getOracleErrorDetails(error);
      throw new OracleSyncError(
        `Unexpected error in batch ${Math.floor(i / config.maxBatchSize) + 1}: ${errorMsg}`,
        oracleDetail,
        batch[0],
        error
      );
    }
  }

  // Final progress report
  if (params.progress) {
    params.progress.report({
      completed: processedCount,
      total: totalFiles,
      label: failedCount > 0
        ? `Completed with ${failedCount} failures`
        : `All ${processedCount} files synced`,
      error: failedCount > 0 ? `${failedCount} files failed` : undefined,
    });
  }

  // Clear remaining dirty files if all processed
  if (processedCount === totalFiles && failedCount === 0) {
    await clearMemorySyncedSessionFiles({
      sessionsDirtyFiles: params.sessionsDirtyFiles,
      targetSessionFiles: params.targetSessionFiles,
    });
  }

  return {
    handled: true,
    sessionsDirty: Boolean(params.sessionsFullRetryDirty) || 
                   params.sessionsDirtyFiles.size > 0 || 
                   failedCount > 0,
    processedCount,
    failedCount,
    oracleErrors: oracleErrors.length > 0 ? oracleErrors : undefined,
  };
}

// ========================================================================
// Export
// ========================================================================

export default {
  clearMemorySyncedSessionFiles,
  markMemoryTargetSessionFilesDirty,
  runMemoryTargetedSessionSync,
  withOracleTransaction,
  
  // Error helpers
  isOracleConnectionError,
  isOracleDeadlockError,
  isOracleTimeoutError,
  getOracleErrorDetails,
  
  // Custom errors
  TargetedSyncError,
  OracleSyncError,
  OracleRollbackError,
};