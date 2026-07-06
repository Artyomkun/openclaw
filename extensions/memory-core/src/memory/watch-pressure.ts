/**
 * Memory Core - Watch Pressure Module
 * 
 * Handles file watching pressure detection and warnings.
 * 
 * RESPONSIBILITIES:
 * - Count watched files/directories
 * - Detect high watch pressure
 * - Warn on excessive watching
 * - Prevent memory leaks from too many watchers
 * 
 * ORACLE ADAPTATIONS:
 * - Works with Oracle file system monitoring
 * - Integration with Oracle's directory watching
 * - Cross-platform compatibility (Windows, Linux, macOS)
 */

import type { FSWatcher } from "chokidar";

// ========================================================================
// Constants
// ========================================================================

/**
 * Threshold for watch pressure warning.
 * When number of watched paths exceeds this, warning is triggered.
 */
export const MEMORY_WATCH_PRESSURE_WARNING_THRESHOLD = 2_000;

/**
 * Oracle-specific watch pressure threshold.
 * Oracle may have different limits on different platforms.
 */
export const ORACLE_WATCH_PRESSURE_THRESHOLD = {
  /** Windows: lower limit due to handle limits */
  windows: 1_500,
  /** Linux: higher limit, more robust */
  linux: 4_000,
  /** macOS: moderate limit */
  darwin: 3_000,
  /** Default fallback */
  default: 2_000,
} as const;

/**
 * Watch pressure levels.
 */
export const WATCH_PRESSURE_LEVEL = {
  /** Normal: below threshold */
  NORMAL: 'normal',
  /** Elevated: near threshold */
  ELEVATED: 'elevated',
  /** Critical: above threshold */
  CRITICAL: 'critical',
} as const;

// ========================================================================
// Types
// ========================================================================

export type MemoryWatchPressureUnit = "directories" | "paths";

export type MemoryWatchPressureWarningState = {
  shown: boolean;
};

export type WatchPressureLevel = typeof WATCH_PRESSURE_LEVEL[keyof typeof WATCH_PRESSURE_LEVEL];

export interface WatchPressureInfo {
  /** Total watched count */
  count: number;
  /** Unit type (directories or paths) */
  unit: MemoryWatchPressureUnit;
  /** Pressure level */
  level: WatchPressureLevel;
  /** Whether threshold is exceeded */
  exceeded: boolean;
  /** Percentage of threshold */
  percentage: number;
  /** Platform-specific info */
  platform?: string;
  /** Recommended action */
  recommendation?: string;
}

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Counts watched entries from chokidar watcher.
 * 
 * @param watcher - Chokidar FSWatcher instance
 * @returns Total count of watched entries
 * 
 * @example
 * ```typescript
 * const count = countChokidarWatchedEntries(watcher);
 * console.log(`Watching ${count} entries`);
 * ```
 */
export function countChokidarWatchedEntries(watcher: FSWatcher): number {
  const watched = watcher.getWatched();
  let count = Object.keys(watched).length;
  
  for (const entries of Object.values(watched)) {
    count += entries.length;
  }
  
  return count;
}

/**
 * Gets platform-specific watch pressure threshold.
 * 
 * @param platform - OS platform (process.platform)
 * @returns Threshold for that platform
 * 
 * @example
 * ```typescript
 * const threshold = getPlatformThreshold(process.platform);
 * // Windows: 1500, Linux: 4000, macOS: 3000
 * ```
 */
export function getPlatformThreshold(platform: string): number {
  if (platform === 'win32') {
    return ORACLE_WATCH_PRESSURE_THRESHOLD.windows;
  }
  if (platform === 'linux') {
    return ORACLE_WATCH_PRESSURE_THRESHOLD.linux;
  }
  if (platform === 'darwin') {
    return ORACLE_WATCH_PRESSURE_THRESHOLD.darwin;
  }
  return ORACLE_WATCH_PRESSURE_THRESHOLD.default;
}

/**
 * Determines watch pressure level.
 * 
 * @param count - Number of watched entries
 * @param threshold - Threshold value
 * @returns Pressure level
 * 
 * @example
 * ```typescript
 * const level = getWatchPressureLevel(1500, 2000);
 * // Returns: 'elevated'
 * ```
 */
export function getWatchPressureLevel(
  count: number,
  threshold: number
): WatchPressureLevel {
  if (count >= threshold * 1.5) {
    return WATCH_PRESSURE_LEVEL.CRITICAL;
  }
  if (count >= threshold * 0.8) {
    return WATCH_PRESSURE_LEVEL.ELEVATED;
  }
  return WATCH_PRESSURE_LEVEL.NORMAL;
}

/**
 * Gets recommendation based on pressure level.
 * 
 * @param level - Watch pressure level
 * @param count - Number of watched entries
 * @param unit - Unit type
 * @returns Recommendation string
 */
export function getWatchPressureRecommendation(
  level: WatchPressureLevel,
  count: number,
  unit: MemoryWatchPressureUnit
): string {
  switch (level) {
    case WATCH_PRESSURE_LEVEL.CRITICAL:
      return `Critical: ${count} ${unit} being watched. Consider reducing watched paths or using fewer directories.`;

    case WATCH_PRESSURE_LEVEL.ELEVATED:
      return `Elevated: ${count} ${unit} being watched. Consider excluding node_modules, .git, or other large directories.`;

    case WATCH_PRESSURE_LEVEL.NORMAL:
      return `Normal: ${count} ${unit} being watched. No action needed.`;

    default:
      return `Watching ${count} ${unit}`;
  }
}

/**
 * Gets detailed watch pressure info.
 * 
 * @param watcher - Chokidar FSWatcher instance
 * @param platform - OS platform
 * @returns Watch pressure information
 * 
 * @example
 * ```typescript
 * const info = getWatchPressureInfo(watcher, process.platform);
 * if (info.exceeded) {
 *   console.warn(info.recommendation);
 * }
 * ```
 */
export function getWatchPressureInfo(
  watcher: FSWatcher,
  platform: string = process.platform
): WatchPressureInfo {
  const count = countChokidarWatchedEntries(watcher);
  const threshold = getPlatformThreshold(platform);
  const level = getWatchPressureLevel(count, threshold);
  const unit: MemoryWatchPressureUnit = 'paths';

  return {
    count,
    unit,
    level,
    exceeded: count > threshold,
    percentage: Math.min(100, Math.round((count / threshold) * 100)),
    platform,
    recommendation: getWatchPressureRecommendation(level, count, unit),
  };
}

/**
 * Warns if memory watch pressure is high.
 * 
 * @param state - Warning state (prevents duplicate warnings)
 * @param count - Number of watched entries
 * @param unit - Unit type
 * @param pressureDetail - Additional details
 * @param remediation - How to fix
 * @param warn - Warning function
 * @returns True if warning was shown
 * 
 * @example
 * ```typescript
 * const state = { shown: false };
 * const warned = warnIfMemoryWatchPressureHigh(
 *   state,
 *   3000,
 *   'paths',
 *   'High memory usage detected.',
 *   'Reduce watched paths in configuration.',
 *   console.warn
 * );
 * ```
 */
export function warnIfMemoryWatchPressureHigh(
  state: MemoryWatchPressureWarningState,
  count: number,
  unit: MemoryWatchPressureUnit,
  pressureDetail: string,
  remediation: string,
  warn: (message: string) => void,
): boolean {
  if (state.shown || count <= MEMORY_WATCH_PRESSURE_WARNING_THRESHOLD) {
    return false;
  }
  
  state.shown = true;
  warn(`Memory file watching is tracking ${count} ${unit}. ${pressureDetail} ${remediation}`);
  return true;
}

/**
 * Warns if memory watch pressure is high with platform-specific info.
 * 
 * @param state - Warning state
 * @param watcher - Chokidar FSWatcher instance
 * @param warn - Warning function
 * @param platform - OS platform
 * @returns True if warning was shown
 * 
 * @example
 * ```typescript
 * const warned = warnIfWatchPressureHighDetailed(
 *   state,
 *   watcher,
 *   console.warn,
 *   process.platform
 * );
 * ```
 */
export function warnIfWatchPressureHighDetailed(
  state: MemoryWatchPressureWarningState,
  watcher: FSWatcher,
  warn: (message: string) => void,
  platform: string = process.platform
): boolean {
  if (state.shown) {
    return false;
  }

  const info = getWatchPressureInfo(watcher, platform);
  
  if (!info.exceeded) {
    return false;
  }

  state.shown = true;
  
  const message = [
    `⚠️ Memory watch pressure: ${info.count} ${info.unit} (${info.percentage}% of limit)`,
    `Platform: ${info.platform}`,
    `Level: ${info.level.toUpperCase()}`,
    `Recommendation: ${info.recommendation}`,
  ].join('\n');

  warn(message);
  return true;
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Constants
  MEMORY_WATCH_PRESSURE_WARNING_THRESHOLD,
  ORACLE_WATCH_PRESSURE_THRESHOLD,
  WATCH_PRESSURE_LEVEL,
  
  // Core
  countChokidarWatchedEntries,
  getPlatformThreshold,
  getWatchPressureLevel,
  getWatchPressureRecommendation,
  getWatchPressureInfo,
  warnIfMemoryWatchPressureHigh,
  warnIfWatchPressureHighDetailed
};