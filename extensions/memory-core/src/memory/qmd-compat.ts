/**
 * Memory Core - QMD Compat Module
 * 
 * QMD (Quick Markdown) compatibility layer.
 * Handles collection pattern flags for QMD.
 * 
 * RESPONSIBILITIES:
 * - Resolve QMD collection pattern flags
 * - Determine preferred flag order
 * - Support --glob and --mask patterns
 * 
 * ORACLE ADAPTATIONS:
 * - Works with Oracle file system patterns
 * - Cross-platform pattern handling
 * - Windows/Linux/macOS compatibility
 */

// ========================================================================
// Types
// ========================================================================

/**
 * QMD collection pattern flag.
 * - --glob: Glob pattern matching (uses glob syntax)
 * - --mask: Mask pattern matching (uses simple mask syntax)
 */
export type QmdCollectionPatternFlag = "--glob" | "--mask";

/**
 * QMD pattern configuration.
 */
export interface QmdPatternConfig {
  /** Preferred flag */
  preferredFlag: QmdCollectionPatternFlag | null;
  /** Pattern syntax */
  syntax: 'glob' | 'mask';
  /** Description */
  description: string;
}

// ========================================================================
// Constants
// ========================================================================

/**
 * Pattern configurations.
 */
export const QMD_PATTERN_CONFIGS: Record<QmdCollectionPatternFlag, QmdPatternConfig> = {
  '--glob': {
    preferredFlag: '--glob',
    syntax: 'glob',
    description: 'Glob pattern matching (supports *, **, ?)',
  },
  '--mask': {
    preferredFlag: '--mask',
    syntax: 'mask',
    description: 'Mask pattern matching (supports * and ?)',
  },
};

/**
 * Available pattern flags.
 */
export const QMD_PATTERN_FLAGS = ['--glob', '--mask'] as const;

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Resolves QMD collection pattern flags in preferred order.
 * 
 * @param preferredFlag - Preferred flag or null
 * @returns Array of flags in priority order
 * 
 * @example
 * ```typescript
 * const flags = resolveQmdCollectionPatternFlags('--glob');
 * // Returns: ['--glob', '--mask']
 * 
 * const flags = resolveQmdCollectionPatternFlags('--mask');
 * // Returns: ['--mask', '--glob']
 * 
 * const flags = resolveQmdCollectionPatternFlags(null);
 * // Returns: ['--mask', '--glob'] (default)
 * ```
 */
export function resolveQmdCollectionPatternFlags(
  preferredFlag: QmdCollectionPatternFlag | null,
): QmdCollectionPatternFlag[] {
  return preferredFlag === "--glob" ? ["--glob", "--mask"] : ["--mask", "--glob"];
}

/**
 * Gets pattern configuration for a flag.
 * 
 * @param flag - Pattern flag
 * @returns Pattern configuration
 * 
 * @example
 * ```typescript
 * const config = getQmdPatternConfig('--glob');
 * // Returns: { preferredFlag: '--glob', syntax: 'glob', description: '...' }
 * ```
 */
export function getQmdPatternConfig(
  flag: QmdCollectionPatternFlag
): QmdPatternConfig {
  return QMD_PATTERN_CONFIGS[flag];
}

/**
 * Checks if pattern flag is valid.
 * 
 * @param flag - Pattern flag
 * @returns True if valid
 * 
 * @example
 * ```typescript
 * isValidQmdPatternFlag('--glob') // true
 * isValidQmdPatternFlag('--invalid') // false
 * ```
 */
export function isValidQmdPatternFlag(flag: string): flag is QmdCollectionPatternFlag {
  return QMD_PATTERN_FLAGS.includes(flag as QmdCollectionPatternFlag);
}

/**
 * Gets preferred pattern flag from configuration.
 * 
 * @param config - Pattern configuration
 * @returns Preferred flag
 * 
 * @example
 * ```typescript
 * const flag = getPreferredQmdPatternFlag({ preferredFlag: '--glob' });
 * // Returns: '--glob'
 * ```
 */
export function getPreferredQmdPatternFlag(
  config: QmdPatternConfig
): QmdCollectionPatternFlag {
  return config.preferredFlag ?? '--mask';
}

/**
 * Converts pattern flag to syntax.
 * 
 * @param flag - Pattern flag
 * @returns Syntax type
 * 
 * @example
 * ```typescript
 * const syntax = qmdFlagToSyntax('--glob');
 * // Returns: 'glob'
 * ```
 */
export function qmdFlagToSyntax(flag: QmdCollectionPatternFlag): 'glob' | 'mask' {
  return flag === '--glob' ? 'glob' : 'mask';
}

/**
 * Converts syntax to pattern flag.
 * 
 * @param syntax - Syntax type
 * @returns Pattern flag
 * 
 * @example
 * ```typescript
 * const flag = qmdSyntaxToFlag('glob');
 * // Returns: '--glob'
 * ```
 */
export function qmdSyntaxToFlag(syntax: 'glob' | 'mask'): QmdCollectionPatternFlag {
  return syntax === 'glob' ? '--glob' : '--mask';
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  resolveQmdCollectionPatternFlags,
  getQmdPatternConfig,
  isValidQmdPatternFlag,
  getPreferredQmdPatternFlag,
  qmdFlagToSyntax,
  qmdSyntaxToFlag,
  
  // Constants
  QMD_PATTERN_CONFIGS,
  QMD_PATTERN_FLAGS,
};