/**
 * Memory Core - Watch Settle Module
 * 
 * Handles file watch settling and stabilization.
 * 
 * RESPONSIBILITIES:
 * - Queue watch events
 * - Wait for file operations to settle
 * - Detect file changes
 * - Prevent duplicate events
 * - Handle file deletion/creation
 * 
 * ORACLE ADAPTATIONS:
 * - Works with Oracle file system monitoring
 * - Cross-platform compatibility (Windows, Linux, macOS)
 * - Handles Oracle-specific file paths
 */

import fsSync from "node:fs";
import path from "node:path";

// ========================================================================
// Constants
// ========================================================================

/**
 * Recheck delay in milliseconds.
 * Time to wait before rechecking file state.
 */
const MEMORY_WATCH_SETTLE_RECHECK_MS = 100;

/**
 * Maximum settle attempts before giving up.
 */
const MAX_SETTLE_ATTEMPTS = 3;

/**
 * Settle timeout in milliseconds.
 */
const SETTLE_TIMEOUT_MS = 5000;

// ========================================================================
// Types
// ========================================================================

/**
 * Watch event stats.
 */
export type MemoryWatchEventStats = {
  isDirectory?: () => boolean;
  size?: number;
  mtimeMs?: number;
};

/**
 * Watch path snapshot.
 */
type WatchPathSnapshot = {
  size: number;
  mtimeMs: number;
};

/**
 * Watch settle queue.
 * Map of file path → snapshot or null (for deleted files).
 */
export type MemoryWatchSettleQueue = Map<string, WatchPathSnapshot | null>;

/**
 * Settle result.
 */
export interface SettleResult {
  /** Whether all paths are settled */
  settled: boolean;
  /** Number of settled paths */
  settledCount: number;
  /** Number of unsettled paths */
  unsettledCount: number;
  /** Unsettled paths */
  unsettledPaths: string[];
  /** Settle time in milliseconds */
  settleTimeMs: number;
  /** Number of attempts */
  attempts: number;
}

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Creates snapshot from stats.
 * 
 * @param stats - File stats
 * @returns Snapshot or null if directory or invalid
 */
function snapshotFromStats(stats?: MemoryWatchEventStats): WatchPathSnapshot | null {
  if (!stats || stats.isDirectory?.()) {
    return null;
  }
  if (typeof stats.size !== "number" || typeof stats.mtimeMs !== "number") {
    return null;
  }
  return { size: stats.size, mtimeMs: stats.mtimeMs };
}

/**
 * Compares two snapshots.
 * 
 * @param left - First snapshot
 * @param right - Second snapshot
 * @returns True if snapshots match
 */
function snapshotsMatch(left: WatchPathSnapshot | null, right: WatchPathSnapshot | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.size === right.size && left.mtimeMs === right.mtimeMs;
}

/**
 * Takes snapshot of file path.
 * 
 * @param filePath - File path
 * @returns Snapshot or null if file doesn't exist or is directory
 */
function snapshotPath(filePath: string): WatchPathSnapshot | null {
  try {
    const stats = fsSync.statSync(filePath);
    if (stats.isDirectory()) {
      return null;
    }
    return { size: stats.size, mtimeMs: stats.mtimeMs };
  } catch {
    return null;
  }
}

/**
 * Delay helper.
 * 
 * @param ms - Milliseconds to delay
 */
async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ========================================================================
// Public Functions
// ========================================================================

/**
 * Records watch event path in queue.
 * 
 * @param queue - Settle queue
 * @param watchPath - File path
 * @param stats - Event stats
 * 
 * @example
 * ```typescript
 * recordMemoryWatchEventPath(queue, '/path/to/file.md', {
 *   size: 1024,
 *   mtimeMs: Date.now()
 * });
 * ```
 */
export function recordMemoryWatchEventPath(
  queue: MemoryWatchSettleQueue,
  watchPath?: string,
  stats?: MemoryWatchEventStats,
): void {
  if (!watchPath) {
    return;
  }
  const trimmed = watchPath.trim();
  if (!trimmed) {
    return;
  }
  queue.set(path.resolve(trimmed), snapshotFromStats(stats));
}

/**
 * Settles watch event paths.
 * 
 * Waits for files to stabilize (no changes for a period).
 * 
 * @param queue - Settle queue
 * @param options - Settle options
 * @returns True if all paths settled
 * 
 * @example
 * ```typescript
 * const settled = await settleMemoryWatchEventPaths(queue, {
 *   maxAttempts: 3,
 *   timeoutMs: 5000
 * });
 * 
 * if (settled) {
 *   console.log('All files settled');
 * } else {
 *   console.warn('Some files did not settle');
 * }
 * ```
 */
export async function settleMemoryWatchEventPaths(
  queue: MemoryWatchSettleQueue,
  options?: {
    maxAttempts?: number;
    timeoutMs?: number;
  }
): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? MAX_SETTLE_ATTEMPTS;
  const timeoutMs = options?.timeoutMs ?? SETTLE_TIMEOUT_MS;
  const startTime = Date.now();

  if (queue.size === 0) {
    return true;
  }

  let attempts = 0;
  
  while (attempts < maxAttempts) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      break;
    }

    const entries = Array.from(queue.entries());
    queue.clear();
    const missingBaseline: Array<{ filePath: string; snapshot: WatchPathSnapshot }> = [];

    // Check each file
    for (const [filePath, previousSnapshot] of entries) {
      const currentSnapshot = snapshotPath(filePath);
      
      if (previousSnapshot === null) {
        // File was missing, now exists
        if (currentSnapshot !== null) {
          missingBaseline.push({ filePath, snapshot: currentSnapshot });
        }
        continue;
      }
      
      // File changed - re-queue
      if (!snapshotsMatch(previousSnapshot, currentSnapshot)) {
        queue.set(filePath, currentSnapshot);
      }
    }

    // Recheck missing files
    if (missingBaseline.length > 0) {
      await delay(MEMORY_WATCH_SETTLE_RECHECK_MS);
      
      for (const entry of missingBaseline) {
        const currentSnapshot = snapshotPath(entry.filePath);
        if (!snapshotsMatch(entry.snapshot, currentSnapshot)) {
          queue.set(entry.filePath, currentSnapshot);
        }
      }
    }

    attempts++;

    // If queue empty, all settled
    if (queue.size === 0) {
      return true;
    }

    // Wait before next attempt
    if (attempts < maxAttempts) {
      await delay(MEMORY_WATCH_SETTLE_RECHECK_MS);
    }
  }

  return queue.size === 0;
}

/**
 * Gets settle result with detailed info.
 * 
 * @param queue - Settle queue
 * @param options - Settle options
 * @returns Detailed settle result
 * 
 * @example
 * ```typescript
 * const result = await settleMemoryWatchEventPathsDetailed(queue);
 * console.log(`Settled: ${result.settledCount}, Unsettled: ${result.unsettledCount}`);
 * ```
 */
export async function settleMemoryWatchEventPathsDetailed(
  queue: MemoryWatchSettleQueue,
  options?: {
    maxAttempts?: number;
    timeoutMs?: number;
  }
): Promise<SettleResult> {
  const maxAttempts = options?.maxAttempts ?? MAX_SETTLE_ATTEMPTS;
  const timeoutMs = options?.timeoutMs ?? SETTLE_TIMEOUT_MS;
  const startTime = Date.now();

  const unsettledPaths: string[] = [];

  if (queue.size === 0) {
    return {
      settled: true,
      settledCount: 0,
      unsettledCount: 0,
      unsettledPaths: [],
      settleTimeMs: 0,
      attempts: 0,
    };
  }

  let attempts = 0;
  const initialSize = queue.size;

  while (attempts < maxAttempts) {
    if (Date.now() - startTime > timeoutMs) {
      break;
    }

    const entries = Array.from(queue.entries());
    queue.clear();
    const missingBaseline: Array<{ filePath: string; snapshot: WatchPathSnapshot }> = [];

    for (const [filePath, previousSnapshot] of entries) {
      const currentSnapshot = snapshotPath(filePath);
      
      if (previousSnapshot === null) {
        if (currentSnapshot !== null) {
          missingBaseline.push({ filePath, snapshot: currentSnapshot });
        }
        continue;
      }
      
      if (!snapshotsMatch(previousSnapshot, currentSnapshot)) {
        queue.set(filePath, currentSnapshot);
      }
    }

    if (missingBaseline.length > 0) {
      await delay(MEMORY_WATCH_SETTLE_RECHECK_MS);
      
      for (const entry of missingBaseline) {
        const currentSnapshot = snapshotPath(entry.filePath);
        if (!snapshotsMatch(entry.snapshot, currentSnapshot)) {
          queue.set(entry.filePath, currentSnapshot);
        }
      }
    }

    attempts++;

    if (queue.size === 0) {
      break;
    }

    if (attempts < maxAttempts) {
      await delay(MEMORY_WATCH_SETTLE_RECHECK_MS);
    }
  }

  // Collect unsettled paths
  for (const [filePath] of queue) {
    unsettledPaths.push(filePath);
  }

  return {
    settled: queue.size === 0,
    settledCount: initialSize - queue.size,
    unsettledCount: queue.size,
    unsettledPaths,
    settleTimeMs: Date.now() - startTime,
    attempts,
  };
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  recordMemoryWatchEventPath,
  settleMemoryWatchEventPaths,
  settleMemoryWatchEventPathsDetailed
};