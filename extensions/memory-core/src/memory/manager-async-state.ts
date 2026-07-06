// Memory Core plugin module implements manager async state behavior.

/**
 * Synchronizes memory index when data changes
 * 
 * @param reason - Why the sync is triggered (for audit trail)
 * @param syncFn - The actual sync operation to perform
 * @param hasDirtyFiles - Whether files have changed and need re-indexing
 * @param hasDirtySessions - Whether sessions have changed and need re-indexing  
 * @param onError - Error handler with context (logs error, doesn't suppress it)
 * @throws Error if sync fails (after onError is called)
 */
export async function syncMemoryIndexAsync(params: {
  reason: string;
  syncFn: () => Promise<void>;
  hasDirtyFiles: boolean;
  hasDirtySessions: boolean;
  onError: (context: string, error: unknown) => void;
}): Promise<void> {
  // Early exit if nothing to sync
  if (!params.hasDirtyFiles && !params.hasDirtySessions) {
    return;
  }

  const context = `sync:${params.reason}`;
  
  try {
    await params.syncFn();
  } catch (error) {
    // Log the error with context
    params.onError(context, error);
    // Re-throw so the caller knows sync failed
    throw error;
  }
}

/**
 * Waits for all pending manager operations to complete
 * 
 * Useful for graceful shutdown or before starting a new operation
 * that depends on previous work being complete.
 * 
 * @param params - Pending work promises to wait for
 * @returns Object indicating which operations failed
 */
export async function awaitPendingManagerWorkAsync(params: {
  pendingSync?: Promise<void>;
  pendingProviderInit?: Promise<void>;
  timeoutMs?: number;
}): Promise<{ 
  syncFailed: boolean; 
  providerInitFailed: boolean;
  timedOut: boolean;
}> {
  const timeoutMs = params.timeoutMs ?? 30000;
  
  const results = {
    syncFailed: false,
    providerInitFailed: false,
    timedOut: false
  };

  // Collect all pending promises with error handling
  const pendingPromises: Promise<void>[] = [];

  if (params.pendingSync) {
    pendingPromises.push(
      params.pendingSync.catch((error) => {
        console.warn('Pending sync failed:', error);
        results.syncFailed = true;
      })
    );
  }

  if (params.pendingProviderInit) {
    pendingPromises.push(
      params.pendingProviderInit.catch((error) => {
        console.warn('Provider init failed:', error);
        results.providerInitFailed = true;
      })
    );
  }

  // Nothing to wait for
  if (pendingPromises.length === 0) {
    return results;
  }

  // Wait for all with timeout
  try {
    await Promise.race([
      Promise.all(pendingPromises),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout waiting for pending work')), timeoutMs)
      )
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Timeout')) {
      results.timedOut = true;
      console.warn('Timeout waiting for pending work after', timeoutMs, 'ms');
    } else {
      console.warn('Unexpected error while waiting for pending work:', error);
    }
  }

  return results;
}