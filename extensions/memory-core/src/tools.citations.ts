/**
 * Memory Core - Tools Citations
 * 
 * Citation handling for memory search results.
 * 
 * RESPONSIBILITIES:
 * - Resolve citations mode from config
 * - Decorate search results with citations
 * - Format citations for display
 * - Clamp results by injected character budget
 * - Determine if citations should be included
 * 
 * ORACLE ADAPTATIONS:
 * - Works with Oracle search results
 * - Handles Oracle-specific path formatting
 * - Cross-platform path handling
 */

import {
  parseAgentSessionKey,
  type MemoryCitationsMode,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/memory-core-host-runtime-core";
import type { MemorySearchResult } from "openclaw/plugin-sdk/memory-core-host-runtime-files";
import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/string-coerce-runtime";

// ========================================================================
// Types
// ========================================================================

/**
 * Chat type derived from session key.
 */
export type ChatType = "direct" | "group" | "channel";

// ========================================================================
// Constants
// ========================================================================

/** Default citations mode */
const DEFAULT_CITATIONS_MODE: MemoryCitationsMode = "auto";

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Resolves citations mode from configuration.
 * 
 * @param cfg - OpenClaw configuration
 * @returns Citations mode
 * 
 * @example
 * ```typescript
 * const mode = resolveMemoryCitationsMode(cfg);
 * // Returns: 'auto', 'on', or 'off'
 * ```
 */
export function resolveMemoryCitationsMode(cfg: OpenClawConfig): MemoryCitationsMode {
  const mode = cfg.memory?.citations;
  if (mode === "on" || mode === "off" || mode === "auto") {
    return mode;
  }
  return DEFAULT_CITATIONS_MODE;
}

/**
 * Decorates search results with citations.
 * 
 * @param results - Search results
 * @param include - Whether to include citations
 * @returns Results with citations
 * 
 * @example
 * ```typescript
 * const results = decorateCitations(searchResults, true);
 * // Each result has: { ..., citation: 'path/to/file.md#L10-L20', snippet: '...\n\nSource: path/to/file.md#L10-L20' }
 * ```
 */
export function decorateCitations(
  results: MemorySearchResult[],
  include: boolean,
): MemorySearchResult[] {
  if (!include) {
    return results.map((entry) => ({ ...entry, citation: undefined }));
  }
  
  return results.map((entry) => {
    const citation = formatCitation(entry);
    const snippet = `${entry.snippet.trim()}\n\nSource: ${citation}`;
    return { ...entry, citation, snippet };
  });
}

/**
 * Formats citation from search result.
 * 
 * @param entry - Search result
 * @returns Formatted citation
 * 
 * @example
 * ```typescript
 * formatCitation({ path: 'memory/2024-01-01.md', startLine: 10, endLine: 20 })
 * // Returns: 'memory/2024-01-01.md#L10-L20'
 * ```
 */
function formatCitation(entry: MemorySearchResult): string {
  const lineRange =
    entry.startLine === entry.endLine
      ? `#L${entry.startLine}`
      : `#L${entry.startLine}-L${entry.endLine}`;
  return `${entry.path}${lineRange}`;
}

/**
 * Clamps results by injected character budget.
 * 
 * @param results - Search results
 * @param budget - Maximum characters to inject
 * @returns Clamped results
 * 
 * @example
 * ```typescript
 * const clamped = clampResultsByInjectedChars(results, 1000);
 * // Only includes results until 1000 characters are used
 * ```
 */
export function clampResultsByInjectedChars(
  results: MemorySearchResult[],
  budget?: number,
): MemorySearchResult[] {
  if (!budget || budget <= 0) {
    return results;
  }
  
  let remaining = budget;
  const clamped: MemorySearchResult[] = [];
  
  for (const entry of results) {
    if (remaining <= 0) {
      break;
    }
    
    const snippet = entry.snippet ?? "";
    
    if (snippet.length <= remaining) {
      clamped.push(entry);
      remaining -= snippet.length;
    } else {
      const trimmed = snippet.slice(0, Math.max(0, remaining));
      clamped.push({ ...entry, snippet: trimmed });
      break;
    }
  }
  
  return clamped;
}

/**
 * Determines if citations should be included.
 * 
 * @param params - Include parameters
 * @param params.mode - Citations mode
 * @param params.sessionKey - Session key
 * @returns True if citations should be included
 * 
 * @example
 * ```typescript
 * shouldIncludeCitations({ mode: 'auto', sessionKey: 'user:direct:123' })
 * // Returns: true (direct chat)
 * 
 * shouldIncludeCitations({ mode: 'auto', sessionKey: 'user:group:456' })
 * // Returns: false (group chat)
 * ```
 */
export function shouldIncludeCitations(params: {
  mode: MemoryCitationsMode;
  sessionKey?: string;
}): boolean {
  if (params.mode === "on") {
    return true;
  }
  if (params.mode === "off") {
    return false;
  }
  return deriveChatTypeFromSessionKey(params.sessionKey) === "direct";
}

/**
 * Derives chat type from session key.
 * 
 * @param sessionKey - Session key
 * @returns Chat type
 * 
 * @example
 * ```typescript
 * deriveChatTypeFromSessionKey('user:direct:123') // 'direct'
 * deriveChatTypeFromSessionKey('user:group:456') // 'group'
 * deriveChatTypeFromSessionKey('user:channel:789') // 'channel'
 * ```
 */
function deriveChatTypeFromSessionKey(sessionKey?: string): ChatType {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed?.rest) {
    return "direct";
  }
  
  const tokens = new Set(
    normalizeLowercaseStringOrEmpty(parsed.rest).split(":").filter(Boolean)
  );
  
  if (tokens.has("channel")) {
    return "channel";
  }
  if (tokens.has("group")) {
    return "group";
  }
  return "direct";
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  resolveMemoryCitationsMode,
  decorateCitations,
  clampResultsByInjectedChars,
  shouldIncludeCitations
};