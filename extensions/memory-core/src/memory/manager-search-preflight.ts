/**
 * Memory Core Plugin - Oracle Search Preflight Module
 * 
 * Oracle-only search preflight validation.
 * Determines if a search should proceed based on query and index state.
 * 
 * RESPONSIBILITIES:
 * - Validate search query
 * - Check if index has content
 * - Determine if provider should be initialized
 * - Return normalized query
 * 
 * ORACLE ONLY - No SQLite compatibility.
 * 
 * ORACLE ADAPTATIONS:
 * - Works with Oracle's search features
 * - Handles Oracle-specific query validation
 * - Optimized for Oracle search patterns
 */

// ========================================================================
// Types
// ========================================================================

/**
 * Search preflight result when search is valid.
 */
export interface ValidSearchPreflight {
  /** Normalized search query */
  normalizedQuery: string;
  /** Whether embedding provider should be initialized */
  shouldInitializeProvider: boolean;
  /** Search should proceed */
  shouldSearch: true;
}

/**
 * Search preflight result when search is invalid.
 */
export interface InvalidSearchPreflight {
  /** Normalized search query */
  normalizedQuery: string;
  /** Whether embedding provider should be initialized */
  shouldInitializeProvider: false;
  /** Search should not proceed */
  shouldSearch: false;
}

/**
 * Search preflight result - either valid or invalid.
 */
export type SearchPreflightResult = ValidSearchPreflight | InvalidSearchPreflight;

/**
 * Configuration for search preflight.
 */
export interface SearchPreflightConfig {
  /** Minimum query length for search */
  minQueryLength?: number;
  /** Maximum query length for search */
  maxQueryLength?: number;
  /** Require provider for search */
  requireProvider?: boolean;
  /** Allow empty content search */
  allowEmptyContent?: boolean;
}

// ========================================================================
// Constants
// ========================================================================

export const SEARCH_PREFLIGHT_DEFAULTS = {
  /** Minimum query length (1 character) */
  MIN_QUERY_LENGTH: 1,
  /** Maximum query length (1000 characters) */
  MAX_QUERY_LENGTH: 1000,
  /** Require provider for search */
  REQUIRE_PROVIDER: true,
  /** Allow empty content search */
  ALLOW_EMPTY_CONTENT: false,
} as const;

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Resolves search preflight validation.
 * 
 * Checks:
 * 1. Query is not empty
 * 2. Query meets minimum length
 * 3. Query does not exceed maximum length
 * 4. Index has content (unless empty content is allowed)
 * 
 * @param params - Preflight parameters
 * @param params.query - Search query
 * @param params.hasIndexedContent - Whether index has content
 * @param params.config - Optional configuration
 * @returns Preflight result
 * 
 * @example
 * ```typescript
 * const result = resolveMemorySearchPreflight({
 *   query: 'hello world',
 *   hasIndexedContent: true,
 *   config: { minQueryLength: 2, maxQueryLength: 500 }
 * });
 * 
 * if (result.shouldSearch) {
 *   // Proceed with search
 *   const results = await search(result.normalizedQuery);
 * }
 * ```
 */
export function resolveMemorySearchPreflight(
  params: {
    query: string;
    hasIndexedContent: boolean;
    config?: SearchPreflightConfig;
  }
): SearchPreflightResult {
  const config = {
    minQueryLength: params.config?.minQueryLength ?? SEARCH_PREFLIGHT_DEFAULTS.MIN_QUERY_LENGTH,
    maxQueryLength: params.config?.maxQueryLength ?? SEARCH_PREFLIGHT_DEFAULTS.MAX_QUERY_LENGTH,
    requireProvider: params.config?.requireProvider ?? SEARCH_PREFLIGHT_DEFAULTS.REQUIRE_PROVIDER,
    allowEmptyContent: params.config?.allowEmptyContent ?? SEARCH_PREFLIGHT_DEFAULTS.ALLOW_EMPTY_CONTENT,
  };

  // Normalize query
  const normalizedQuery = params.query.trim();

  // Check if query is empty
  if (!normalizedQuery) {
    return {
      normalizedQuery,
      shouldInitializeProvider: false,
      shouldSearch: false,
    };
  }

  // Check minimum length
  if (normalizedQuery.length < config.minQueryLength) {
    return {
      normalizedQuery,
      shouldInitializeProvider: false,
      shouldSearch: false,
    };
  }

  // Check maximum length
  if (normalizedQuery.length > config.maxQueryLength) {
    return {
      normalizedQuery: normalizedQuery.substring(0, config.maxQueryLength),
      shouldInitializeProvider: false,
      shouldSearch: false,
    };
  }

  // Check if index has content
  if (!params.hasIndexedContent && !config.allowEmptyContent) {
    return {
      normalizedQuery,
      shouldInitializeProvider: false,
      shouldSearch: false,
    };
  }

  // All checks passed - search is valid
  return {
    normalizedQuery,
    shouldInitializeProvider: config.requireProvider,
    shouldSearch: true,
  };
}

/**
 * Validates search query without checking content.
 * 
 * @param query - Search query
 * @param config - Optional configuration
 * @returns True if query is valid
 * 
 * @example
 * ```typescript
 * const isValid = isValidSearchQuery('hello world');
 * // Returns: true
 * ```
 */
export function isValidSearchQuery(
  query: string,
  config?: {
    minQueryLength?: number;
    maxQueryLength?: number;
  }
): boolean {
  const minLength = config?.minQueryLength ?? SEARCH_PREFLIGHT_DEFAULTS.MIN_QUERY_LENGTH;
  const maxLength = config?.maxQueryLength ?? SEARCH_PREFLIGHT_DEFAULTS.MAX_QUERY_LENGTH;
  
  const normalized = query.trim();
  
  if (!normalized) {
    return false;
  }
  
  if (normalized.length < minLength) {
    return false;
  }
  
  if (normalized.length > maxLength) {
    return false;
  }
  
  return true;
}

/**
 * Checks if query is a simple keyword (no special characters).
 * 
 * @param query - Search query
 * @returns True if query is a simple keyword
 * 
 * @example
 * ```typescript
 * const isKeyword = isSimpleKeyword('hello');
 * // Returns: true
 * 
 * const isKeyword = isSimpleKeyword('hello world');
 * // Returns: false
 * ```
 */
export function isSimpleKeyword(query: string): boolean {
  const normalized = query.trim();
  return /^[a-zA-Z0-9_\p{L}\p{N}]+$/u.test(normalized);
}

/**
 * Gets search query complexity.
 * 
 * @param query - Search query
 * @returns Complexity level: 'simple', 'medium', 'complex'
 * 
 * @example
 * ```typescript
 * const complexity = getSearchComplexity('hello');
 * // Returns: 'simple'
 * 
 * const complexity = getSearchComplexity('hello world');
 * // Returns: 'medium'
 * 
 * const complexity = getSearchComplexity('"hello world" AND (test OR example)');
 * // Returns: 'complex'
 * ```
 */
export function getSearchComplexity(query: string): 'simple' | 'medium' | 'complex' {
  const normalized = query.trim();
  
  if (!normalized) {
    return 'simple';
  }
  
  const words = normalized.split(/\s+/).length;
  const hasOperators = /AND|OR|NOT|\(|\)|"|'/.test(normalized);
  
  if (words <= 2 && !hasOperators) {
    return 'simple';
  }
  
  if (words <= 5 && !hasOperators) {
    return 'medium';
  }
  
  return 'complex';
}

/**
 * Normalizes query for search.
 * 
 * @param query - Search query
 * @param options - Normalization options
 * @returns Normalized query
 * 
 * @example
 * ```typescript
 * const normalized = normalizeSearchQuery('  HELLO   WORLD  ');
 * // Returns: 'hello world'
 * ```
 */
export function normalizeSearchQuery(
  query: string,
  options?: {
    /** Convert to lowercase */
    toLower?: boolean;
    /** Trim whitespace */
    trim?: boolean;
    /** Replace multiple spaces with single */
    collapseSpaces?: boolean;
  }
): string {
  let result = query;
  
  if (options?.trim !== false) {
    result = result.trim();
  }
  
  if (options?.collapseSpaces !== false) {
    result = result.replace(/\s+/g, ' ');
  }
  
  if (options?.toLower) {
    result = result.toLowerCase();
  }
  
  return result;
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  resolveMemorySearchPreflight,
  isValidSearchQuery,
  isSimpleKeyword,
  getSearchComplexity,
  normalizeSearchQuery,
  
  // Constants
  SEARCH_PREFLIGHT_DEFAULTS,
};