/**
 * Memory Core Plugin - Oracle Hybrid Search Module
 * 
 * Oracle-only hybrid search combining vector and keyword results.
 * 
 * RESPONSIBILITIES:
 * - Build FTS query for Oracle Text
 * - Convert BM25 rank to score
 * - Merge vector and keyword results
 * - Apply temporal decay
 * - Apply MMR (Maximum Marginal Relevance)
 * - Rank and sort results
 * 
 * ORACLE ADAPTATIONS:
 * - Oracle Text FTS query building
 * - Oracle-specific BM25 scoring
 * - Hybrid search with Oracle AI Vector Search + Oracle Text
 * - Temporal decay for recency-aware scoring
 * - MMR for diversity-aware re-ranking
 */

import { normalizeStringEntries } from "openclaw/plugin-sdk/string-coerce-runtime";
import { applyMMRToHybridResults, type MMRConfig, DEFAULT_MMR_CONFIG } from "./mmr.js";
import {
  applyTemporalDecayToHybridResults,
  type TemporalDecayConfig,
  DEFAULT_TEMPORAL_DECAY_CONFIG,
} from "./temporal-decay.js";

// ========================================================================
// Types
// ========================================================================

type HybridSource = string;

/**
 * Vector search result.
 */
type HybridVectorResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  vectorScore: number;
};

/**
 * Keyword search result.
 */
type HybridKeywordResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  textScore: number;
};

/**
 * Hybrid search result.
 */
export type HybridResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  vectorScore: number;
  textScore: number;
  snippet: string;
  source: HybridSource;
};

/**
 * Hybrid search configuration.
 */
export interface HybridSearchConfig {
  /** Weight for vector scores (0-1) */
  vectorWeight: number;
  /** Weight for text scores (0-1) */
  textWeight: number;
  /** MMR configuration */
  mmr?: Partial<MMRConfig>;
  /** Temporal decay configuration */
  temporalDecay?: Partial<TemporalDecayConfig>;
  /** Minimum score threshold */
  minScore?: number;
  /** Maximum results */
  maxResults?: number;
}

// ========================================================================
// Constants
// ========================================================================

/** Default hybrid weights */
const DEFAULT_HYBRID_WEIGHTS = {
  vectorWeight: 0.7,
  textWeight: 0.3,
} as const;

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Builds FTS query for Oracle Text.
 * 
 * Converts raw query into Oracle Text format:
 * - Tokenizes query
 * - Quotes tokens for exact phrase matching
 * - Joins with AND for all tokens
 * 
 * @param raw - Raw query string
 * @returns Oracle Text query or null if no tokens
 * 
 * @example
 * ```typescript
 * const query = buildFtsQuery('hello world');
 * // Returns: '"hello" AND "world"'
 * ```
 */
export function buildFtsQuery(raw: string): string | null {
  const tokens = normalizeStringEntries(raw.match(/[\p{L}\p{N}_]+/gu) ?? []);
  
  if (tokens.length === 0) {
    return null;
  }
  
  const quoted = tokens.map((t) => `"${t.replaceAll('"', "")}"`);
  return quoted.join(" AND ");
}

/**
 * Converts BM25 rank to score.
 * 
 * BM25 rank ranges from 0 to N where lower is better.
 * This function converts to a score in [0, 1] range.
 * 
 * @param rank - BM25 rank
 * @returns Score in [0, 1] range
 * 
 * @example
 * ```typescript
 * const score = bm25RankToScore(0);
 * // Returns: 1 (best match)
 * 
 * const score = bm25RankToScore(100);
 * // Returns: ~0.0099 (poor match)
 * ```
 */
export function bm25RankToScore(rank: number): number {
  if (!Number.isFinite(rank)) {
    return 1 / (1 + 999);
  }
  
  if (rank < 0) {
    const relevance = -rank;
    return relevance / (1 + relevance);
  }
  
  return 1 / (1 + rank);
}

/**
 * Merges vector and keyword results.
 * 
 * Strategy:
 * 1. Group results by ID
 * 2. Combine vector and text scores with weights
 * 3. Apply temporal decay
 * 4. Apply MMR for diversity
 * 5. Sort by final score
 * 
 * @param params - Merge parameters
 * @param params.vector - Vector search results
 * @param params.keyword - Keyword search results
 * @param params.vectorWeight - Weight for vector scores
 * @param params.textWeight - Weight for text scores
 * @param params.workspaceDir - Workspace directory for temporal decay
 * @param params.mmr - MMR configuration
 * @param params.temporalDecay - Temporal decay configuration
 * @param params.nowMs - Current time (for testing)
 * @returns Merged and ranked results
 * 
 * @example
 * ```typescript
 * const results = await mergeHybridResults({
 *   vector: vectorResults,
 *   keyword: keywordResults,
 *   vectorWeight: 0.7,
 *   textWeight: 0.3,
 *   workspaceDir: '/path/to/workspace',
 *   mmr: { enabled: true, lambda: 0.5 },
 *   temporalDecay: { enabled: true, halfLifeDays: 30 }
 * });
 * ```
 */
export async function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
  workspaceDir?: string;
  mmr?: Partial<MMRConfig>;
  temporalDecay?: Partial<TemporalDecayConfig>;
  nowMs?: number;
}): Promise<HybridResult[]> {
  // Group results by ID
  const byId = new Map<
    string,
    {
      id: string;
      path: string;
      startLine: number;
      endLine: number;
      source: HybridSource;
      snippet: string;
      vectorScore: number;
      textScore: number;
    }
  >();

  // Add vector results
  for (const r of params.vector) {
    byId.set(r.id, {
      id: r.id,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      source: r.source,
      snippet: r.snippet,
      vectorScore: r.vectorScore,
      textScore: 0,
    });
  }

  // Add keyword results (merge with existing)
  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    
    if (existing) {
      existing.textScore = r.textScore;
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
      }
    } else {
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: r.source,
        snippet: r.snippet,
        vectorScore: 0,
        textScore: r.textScore,
      });
    }
  }

  // Calculate combined score
  const merged = Array.from(byId.values()).map((entry) => {
    const score = params.vectorWeight * entry.vectorScore + params.textWeight * entry.textScore;
    
    return {
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score,
      vectorScore: entry.vectorScore,
      textScore: entry.textScore,
      snippet: entry.snippet,
      source: entry.source,
    };
  });

  // Apply temporal decay
  const temporalDecayConfig = { ...DEFAULT_TEMPORAL_DECAY_CONFIG, ...params.temporalDecay };
  const decayed = await applyTemporalDecayToHybridResults({
    results: merged,
    temporalDecay: temporalDecayConfig,
    workspaceDir: params.workspaceDir,
    nowMs: params.nowMs,
  });

  // Sort by score (descending)
  const sorted = decayed.toSorted((a, b) => b.score - a.score);

  // Apply MMR re-ranking if enabled
  const mmrConfig = { ...DEFAULT_MMR_CONFIG, ...params.mmr };
  if (mmrConfig.enabled) {
    return applyMMRToHybridResults(sorted, mmrConfig);
  }

  return sorted;
}

/**
 * Merges hybrid results with config.
 * 
 * Convenience wrapper with configuration object.
 * 
 * @param params - Merge parameters with config
 * @returns Merged and ranked results
 * 
 * @example
 * ```typescript
 * const results = await mergeHybridResultsWithConfig({
 *   vector: vectorResults,
 *   keyword: keywordResults,
 *   config: {
 *     vectorWeight: 0.7,
 *     textWeight: 0.3,
 *     minScore: 0.5,
 *     maxResults: 10,
 *     mmr: { enabled: true, lambda: 0.5 },
 *     temporalDecay: { enabled: true, halfLifeDays: 30 }
 *   },
 *   workspaceDir: '/path/to/workspace'
 * });
 * ```
 */
export async function mergeHybridResultsWithConfig(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  config?: HybridSearchConfig;
  workspaceDir?: string;
  nowMs?: number;
}): Promise<HybridResult[]> {
  const config = params.config ?? {
    vectorWeight: DEFAULT_HYBRID_WEIGHTS.vectorWeight,
    textWeight: DEFAULT_HYBRID_WEIGHTS.textWeight,
  };

  const results = await mergeHybridResults({
    vector: params.vector,
    keyword: params.keyword,
    vectorWeight: config.vectorWeight,
    textWeight: config.textWeight,
    workspaceDir: params.workspaceDir,
    mmr: config.mmr,
    temporalDecay: config.temporalDecay,
    nowMs: params.nowMs,
  });

  // Apply min score filter
  if (config.minScore !== undefined) {
    return results.filter((r) => r.score >= config.minScore!);
  }

  // Apply max results limit
  if (config.maxResults !== undefined) {
    return results.slice(0, config.maxResults);
  }

  return results;
}

/**
 * Normalizes scores to [0, 1] range.
 * 
 * @param results - Results with scores
 * @returns Results with normalized scores
 */
export function normalizeHybridScores(results: HybridResult[]): HybridResult[] {
  if (results.length === 0) {
    return results;
  }

  // Find min and max scores
  let maxScore = -Infinity;
  let minScore = Infinity;

  for (const r of results) {
    if (r.score > maxScore) maxScore = r.score;
    if (r.score < minScore) minScore = r.score;
  }

  // If all scores are equal, return as-is
  if (maxScore === minScore) {
    return results;
  }

  // Normalize to [0, 1]
  const range = maxScore - minScore;
  
  return results.map((r) => ({
    ...r,
    score: (r.score - minScore) / range,
    vectorScore: r.vectorScore > 0 ? (r.vectorScore - minScore) / range : 0,
    textScore: r.textScore > 0 ? (r.textScore - minScore) / range : 0,
  }));
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  buildFtsQuery,
  bm25RankToScore,
  mergeHybridResults,
  mergeHybridResultsWithConfig,
  normalizeHybridScores,
};