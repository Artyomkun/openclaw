/**
 * Memory Core Plugin - Oracle Session Reindex Module
 * 
 * Oracle-only session reindex logic.
 * Determines when sessions should be reindexed.
 * 
 * RESPONSIBILITIES:
 * - Check if session sync is needed
 * - Handle reindex triggers
 * - Session dirty state management
 * - Force reindex conditions
 */

// ========================================================================
// Types
// ========================================================================

/**
 * Session reindex configuration.
 */
export interface SessionReindexConfig {
  /** Check session source availability */
  hasSessionSource: boolean;
  /** Whether sessions are dirty */
  sessionsDirty: boolean;
  /** Whether full retry is needed */
  sessionsFullRetryDirty?: boolean;
  /** Number of dirty session files */
  dirtySessionFileCount: number;
  /** Whether full reindex is needed */
  needsFullReindex?: boolean;
}

/**
 * Session reindex result.
 */
export interface SessionReindexResult {
  /** Whether sessions should be synced */
  shouldSync: boolean;
  /** Reason for decision */
  reason: string;
  /** Priority level (1-5, higher = more important) */
  priority: number;
}

// ========================================================================
// Constants
// ========================================================================

/**
 * Priority levels for session reindex.
 */
export const SESSION_REINDEX_PRIORITY = {
  /** No sync needed */
  NONE: 0,
  /** Low priority - dirty sessions */
  LOW: 2,
  /** Medium priority - full retry */
  MEDIUM: 4,
  /** High priority - full reindex */
  HIGH: 5,
} as const;

/**
 * Reasons for session reindex decision.
 */
export const SESSION_REINDEX_REASON = {
  NO_SESSION_SOURCE: 'no_session_source',
  FULL_REINDEX: 'full_reindex',
  FULL_RETRY_DIRTY: 'full_retry_dirty',
  DIRTY_SESSIONS: 'dirty_sessions',
  NO_DIRTY_SESSIONS: 'no_dirty_sessions',
} as const;

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Determines if sessions should be synced for reindex.
 * 
 * Checks multiple conditions in priority order:
 * 1. Explicit session targets
 * 2. Force sync
 * 3. Full reindex
 * 4. Retry dirty
 * 5. Normal dirty state
 * 
 * @param params - Reindex parameters
 * @returns True if sessions should be synced
 * 
 * @example
 * ```typescript
 * const shouldSync = shouldSyncSessionsForReindex({
 *   hasSessionSource: true,
 *   sessionsDirty: true,
 *   dirtySessionFileCount: 5,
 *   needsFullReindex: true
 * });
 * // Returns: true
 * ```
 */
export function shouldSyncSessionsForReindex(params: {
  hasSessionSource: boolean;
  sessionsDirty: boolean;
  sessionsFullRetryDirty?: boolean;
  dirtySessionFileCount: number;
  needsFullReindex?: boolean;
}): boolean {
  // No session source - nothing to sync
  if (!params.hasSessionSource) {
    return false;
  }

  // Full reindex needed - sync everything
  if (params.needsFullReindex) {
    return true;
  }

  // Full retry dirty - sync everything
  if (params.sessionsFullRetryDirty) {
    return true;
  }

  // Normal dirty state - sync only if there are dirty files
  return params.sessionsDirty && params.dirtySessionFileCount > 0;
}

/**
 * Gets detailed session reindex decision.
 * 
 * Returns reason and priority for better control.
 * 
 * @param params - Reindex parameters
 * @returns Detailed decision result
 * 
 * @example
 * ```typescript
 * const result = getSessionReindexDecision({
 *   hasSessionSource: true,
 *   sessionsDirty: true,
 *   dirtySessionFileCount: 5,
 *   needsFullReindex: true
 * });
 * // Returns: { shouldSync: true, reason: 'full_reindex', priority: 5 }
 * ```
 */
export function getSessionReindexDecision(params: SessionReindexConfig): SessionReindexResult {
  // No session source
  if (!params.hasSessionSource) {
    return {
      shouldSync: false,
      reason: SESSION_REINDEX_REASON.NO_SESSION_SOURCE,
      priority: SESSION_REINDEX_PRIORITY.NONE,
    };
  }

  // Full reindex - high priority
  if (params.needsFullReindex) {
    return {
      shouldSync: true,
      reason: SESSION_REINDEX_REASON.FULL_REINDEX,
      priority: SESSION_REINDEX_PRIORITY.HIGH,
    };
  }

  // Full retry dirty - medium priority
  if (params.sessionsFullRetryDirty) {
    return {
      shouldSync: true,
      reason: SESSION_REINDEX_REASON.FULL_RETRY_DIRTY,
      priority: SESSION_REINDEX_PRIORITY.MEDIUM,
    };
  }

  // Dirty state - low priority
  if (params.sessionsDirty && params.dirtySessionFileCount > 0) {
    return {
      shouldSync: true,
      reason: SESSION_REINDEX_REASON.DIRTY_SESSIONS,
      priority: SESSION_REINDEX_PRIORITY.LOW,
    };
  }

  // Default - no sync
  return {
    shouldSync: false,
    reason: SESSION_REINDEX_REASON.NO_DIRTY_SESSIONS,
    priority: SESSION_REINDEX_PRIORITY.NONE,
  };
}

/**
 * Checks if session reindex is urgent.
 * 
 * @param params - Reindex parameters
 * @returns True if reindex is urgent
 * 
 * @example
 * ```typescript
 * const isUrgent = isSessionReindexUrgent({
 *   hasSessionSource: true,
 *   needsFullReindex: true
 * });
 * // Returns: true
 * ```
 */
export function isSessionReindexUrgent(params: {
  hasSessionSource: boolean;
  needsFullReindex?: boolean;
  sessionsFullRetryDirty?: boolean;
}): boolean {
  if (!params.hasSessionSource) {
    return false;
  }

  return Boolean(
    params.needsFullReindex ||
    params.sessionsFullRetryDirty
  );
}

/**
 * Gets reindex priority as string.
 * 
 * @param priority - Priority number
 * @returns Priority label
 * 
 * @example
 * ```typescript
 * const label = getReindexPriorityLabel(5);
 * // Returns: 'HIGH'
 * ```
 */
export function getReindexPriorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    [SESSION_REINDEX_PRIORITY.NONE]: 'NONE',
    [SESSION_REINDEX_PRIORITY.LOW]: 'LOW',
    [SESSION_REINDEX_PRIORITY.MEDIUM]: 'MEDIUM',
    [SESSION_REINDEX_PRIORITY.HIGH]: 'HIGH',
  };
  return labels[priority] ?? 'UNKNOWN';
}

/**
 * Checks if sessions need reindex based on state.
 * 
 * @param params - State parameters
 * @returns True if reindex needed
 * 
 * @example
 * ```typescript
 * const needed = needsSessionReindex({
 *   hasSessionSource: true,
 *   sessionsDirty: true,
 *   dirtySessionFileCount: 10,
 *   minDirtyFiles: 1
 * });
 * // Returns: true
 * ```
 */
export function needsSessionReindex(params: {
  hasSessionSource: boolean;
  sessionsDirty: boolean;
  dirtySessionFileCount: number;
  minDirtyFiles?: number;
  needsFullReindex?: boolean;
  sessionsFullRetryDirty?: boolean;
}): boolean {
  const minDirtyFiles = params.minDirtyFiles ?? 1;
  
  if (!params.hasSessionSource) {
    return false;
  }

  if (params.needsFullReindex) {
    return true;
  }

  if (params.sessionsFullRetryDirty) {
    return true;
  }

  return params.sessionsDirty && params.dirtySessionFileCount >= minDirtyFiles;
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  shouldSyncSessionsForReindex,
  getSessionReindexDecision,
  isSessionReindexUrgent,
  needsSessionReindex,
  
  // Helpers
  getReindexPriorityLabel,
  
  // Constants
  SESSION_REINDEX_PRIORITY,
  SESSION_REINDEX_REASON,
};