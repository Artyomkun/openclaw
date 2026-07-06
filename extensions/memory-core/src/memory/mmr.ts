/**
 * Memory Core - MMR Module
 * 
 * Maximal Marginal Relevance (MMR) re-ranking algorithm.
 * 
 * Balances relevance with diversity in search results.
 * 
 * @see Carbonell & Goldstein, "The Use of MMR, Diversity-Based Reranking" (1998)
 * 
 * RESPONSIBILITIES:
 * - Re-rank search results for diversity
 * - Balance relevance vs. diversity with lambda parameter
 * - Support hybrid search results
 * - Tokenize content for similarity comparison
 * 
 * ORACLE ADAPTATIONS:
 * - Works with Oracle search results
 * - Supports CJK, emoji, UTF-8 content
 * - Cross-platform text similarity
 */

import { jaccardSimilarity, textSimilarity, tokenize } from "./tokenize.js";

// ========================================================================
// Types
// ========================================================================

/**
 * MMR item for re-ranking.
 */
export type MMRItem = {
  id: string;
  score: number;
  content: string;
};

/**
 * MMR configuration.
 */
export type MMRConfig = {
  /** Enable/disable MMR re-ranking. Default: false (opt-in) */
  enabled: boolean;
  /** Lambda parameter: 0 = max diversity, 1 = max relevance. Default: 0.7 */
  lambda: number;
  /** Minimum score threshold. Items below this are excluded. Default: 0 */
  minScore?: number;
  /** Maximum items to return. Default: all */
  maxItems?: number;
};

/**
 * MMR result with metadata.
 */
export interface MMRResult<T> {
  /** Re-ranked items */
  items: T[];
  /** MMR scores for each item */
  scores: number[];
  /** Normalized relevance scores */
  relevance: number[];
  /** Max similarity to selected for each item */
  similarities: number[];
  /** Configuration used */
  config: MMRConfig;
}

// ========================================================================
// Constants
// ========================================================================

export const DEFAULT_MMR_CONFIG: MMRConfig = {
  enabled: false,
  lambda: 0.7,
};

// ========================================================================
// Re-export tokenize helpers for backward compatibility
// ========================================================================

export { jaccardSimilarity, textSimilarity, tokenize };

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Compute the maximum similarity between an item and all selected items.
 * 
 * @param item - Item to check
 * @param selectedItems - Already selected items
 * @param tokenCache - Cache of tokenized content
 * @returns Maximum similarity score
 */
function maxSimilarityToSelected(
  item: MMRItem,
  selectedItems: MMRItem[],
  tokenCache: Map<string, Set<string>>,
): number {
  if (selectedItems.length === 0) {
    return 0;
  }

  let maxSim = 0;
  const itemTokens = tokenCache.get(item.id) ?? tokenize(item.content);

  for (const selected of selectedItems) {
    const selectedTokens = tokenCache.get(selected.id) ?? tokenize(selected.content);
    const sim = jaccardSimilarity(itemTokens, selectedTokens);
    if (sim > maxSim) {
      maxSim = sim;
    }
  }

  return maxSim;
}

/**
 * Compute MMR score for a candidate item.
 * 
 * Formula: MMR = λ * relevance - (1-λ) * max_similarity_to_selected
 * 
 * @param relevance - Normalized relevance score
 * @param maxSimilarity - Maximum similarity to selected items
 * @param lambda - Lambda parameter (0 = diversity, 1 = relevance)
 * @returns MMR score
 * 
 * @example
 * ```typescript
 * const score = computeMMRScore(0.9, 0.5, 0.7);
 * // Returns: 0.7 * 0.9 - 0.3 * 0.5 = 0.63 - 0.15 = 0.48
 * ```
 */
export function computeMMRScore(
  relevance: number,
  maxSimilarity: number,
  lambda: number
): number {
  return lambda * relevance - (1 - lambda) * maxSimilarity;
}

/**
 * Normalize scores to [0, 1] range.
 * 
 * @param scores - Array of scores
 * @returns Normalized scores
 */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const range = maxScore - minScore;
  
  if (range === 0) {
    return scores.map(() => 1);
  }
  
  return scores.map((s) => (s - minScore) / range);
}

/**
 * Re-rank items using Maximal Marginal Relevance (MMR).
 * 
 * Algorithm:
 * 1. Start with the highest-scoring item
 * 2. For each remaining slot, select the item that maximizes the MMR score
 * 3. MMR score = λ * relevance - (1-λ) * max_similarity_to_already_selected
 * 
 * @param items - Items to re-rank
 * @param config - MMR configuration
 * @returns Re-ranked items in MMR order
 * 
 * @example
 * ```typescript
 * const results = mmrRerank([
 *   { id: '1', score: 0.9, content: 'hello world' },
 *   { id: '2', score: 0.8, content: 'hello there' },
 *   { id: '3', score: 0.7, content: 'goodbye world' },
 * ], { enabled: true, lambda: 0.5 });
 * ```
 */
export function mmrRerank<T extends MMRItem>(
  items: T[],
  config: Partial<MMRConfig> = {}
): T[] {
  const {
    enabled = DEFAULT_MMR_CONFIG.enabled,
    lambda = DEFAULT_MMR_CONFIG.lambda,
    minScore = 0,
    maxItems = items.length,
  } = config;

  // Early exits
  if (!enabled || items.length <= 1) {
    return [...items];
  }

  // Filter by min score
  let filtered = items.filter((i) => i.score >= minScore);
  
  if (filtered.length === 0) {
    return [];
  }

  // Sort by score initially
  const sorted = [...filtered].toSorted((a, b) => b.score - a.score);

  // If lambda is 1, just return sorted by relevance (no diversity penalty)
  if (lambda >= 1) {
    return sorted.slice(0, maxItems);
  }

  // Clamp lambda to valid range
  const clampedLambda = Math.max(0, Math.min(1, lambda));

  // Pre-tokenize all items for efficiency
  const tokenCache = new Map<string, Set<string>>();
  for (const item of filtered) {
    tokenCache.set(item.id, tokenize(item.content));
  }

  // Normalize scores to [0, 1] for fair comparison with similarity
  const scores = filtered.map((i) => i.score);
  const normalizedScores = normalizeScores(scores);
  const scoreMap = new Map<string, number>(
    filtered.map((item, idx) => [item.id, normalizedScores[idx]])
  );

  const selected: T[] = [];
  const remaining = new Set(filtered);

  // Select items iteratively
  while (remaining.size > 0 && selected.length < maxItems) {
    let bestItem: T | null = null;
    let bestMMRScore = -Infinity;

    for (const candidate of remaining) {
      const relevance = scoreMap.get(candidate.id) ?? 0;
      const maxSim = maxSimilarityToSelected(candidate, selected, tokenCache);
      const mmrScore = computeMMRScore(relevance, maxSim, clampedLambda);

      if (mmrScore > bestMMRScore) {
        bestMMRScore = mmrScore;
        bestItem = candidate;
      }
    }

    if (bestItem) {
      selected.push(bestItem);
      remaining.delete(bestItem);
    } else {
      break;
    }
  }

  return selected;
}

/**
 * Apply MMR re-ranking with detailed results.
 * 
 * @param items - Items to re-rank
 * @param config - MMR configuration
 * @returns Detailed MMR result
 * 
 * @example
 * ```typescript
 * const result = mmrRerankDetailed(items, { enabled: true, lambda: 0.7 });
 * console.log('MMR scores:', result.scores);
 * console.log('Relevance:', result.relevance);
 * console.log('Similarities:', result.similarities);
 * ```
 */
export function mmrRerankDetailed<T extends MMRItem>(
  items: T[],
  config: Partial<MMRConfig> = {}
): MMRResult<T> {
  const finalConfig = { ...DEFAULT_MMR_CONFIG, ...config };
  const {
    enabled = finalConfig.enabled,
    lambda = finalConfig.lambda,
    minScore = 0,
    maxItems = items.length,
  } = finalConfig;

  if (!enabled || items.length === 0) {
    return {
      items: [...items],
      scores: [],
      relevance: [],
      similarities: [],
      config: finalConfig,
    };
  }

  // Filter by min score
  let filtered = items.filter((i) => i.score >= minScore);
  
  if (filtered.length === 0) {
    return {
      items: [],
      scores: [],
      relevance: [],
      similarities: [],
      config: finalConfig,
    };
  }

  // Sort by score initially
  const sorted = [...filtered].toSorted((a, b) => b.score - a.score);

  if (lambda >= 1) {
    const result = sorted.slice(0, maxItems);
    return {
      items: result,
      scores: result.map(() => 1),
      relevance: result.map(() => 1),
      similarities: result.map(() => 0),
      config: finalConfig,
    };
  }

  const clampedLambda = Math.max(0, Math.min(1, lambda));

  // Pre-tokenize all items
  const tokenCache = new Map<string, Set<string>>();
  for (const item of filtered) {
    tokenCache.set(item.id, tokenize(item.content));
  }

  // Normalize scores
  const scores = filtered.map((i) => i.score);
  const normalizedScores = normalizeScores(scores);
  const scoreMap = new Map<string, number>(
    filtered.map((item, idx) => [item.id, normalizedScores[idx]])
  );

  const selected: T[] = [];
  const selectedScores: number[] = [];
  const selectedRelevance: number[] = [];
  const selectedSimilarities: number[] = [];
  const remaining = new Set(filtered);

  while (remaining.size > 0 && selected.length < maxItems) {
    let bestItem: T | null = null;
    let bestMMRScore = -Infinity;
    let bestRelevance = 0;
    let bestSimilarity = 0;

    for (const candidate of remaining) {
      const relevance = scoreMap.get(candidate.id) ?? 0;
      const maxSim = maxSimilarityToSelected(candidate, selected, tokenCache);
      const mmrScore = computeMMRScore(relevance, maxSim, clampedLambda);

      if (mmrScore > bestMMRScore) {
        bestMMRScore = mmrScore;
        bestItem = candidate;
        bestRelevance = relevance;
        bestSimilarity = maxSim;
      }
    }

    if (bestItem) {
      selected.push(bestItem);
      selectedScores.push(bestMMRScore);
      selectedRelevance.push(bestRelevance);
      selectedSimilarities.push(bestSimilarity);
      remaining.delete(bestItem);
    } else {
      break;
    }
  }

  return {
    items: selected,
    scores: selectedScores,
    relevance: selectedRelevance,
    similarities: selectedSimilarities,
    config: finalConfig,
  };
}

/**
 * Apply MMR re-ranking to hybrid search results.
 * 
 * Adapts the generic MMR function to work with hybrid search result format.
 * 
 * @param results - Hybrid search results
 * @param config - MMR configuration
 * @returns Re-ranked results
 * 
 * @example
 * ```typescript
 * const results = applyMMRToHybridResults(searchResults, {
 *   enabled: true,
 *   lambda: 0.7,
 *   minScore: 0.3,
 *   maxItems: 10
 * });
 * ```
 */
export function applyMMRToHybridResults<
  T extends { score: number; snippet: string; path: string; startLine: number }
>(
  results: T[],
  config: Partial<MMRConfig> = {}
): T[] {
  if (results.length === 0) {
    return results;
  }

  // Create a map from ID to original item
  const itemById = new Map<string, T>();

  // Create MMR items with unique IDs
  const mmrItems: MMRItem[] = results.map((r, index) => {
    const id = `${r.path}:${r.startLine}:${index}`;
    itemById.set(id, r);
    return {
      id,
      score: r.score,
      content: r.snippet,
    };
  });

  const reranked = mmrRerank(mmrItems, config);

  // Map back to original items
  return reranked.map((item) => itemById.get(item.id)!);
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Core
  mmrRerank,
  mmrRerankDetailed,
  applyMMRToHybridResults,
  computeMMRScore,
  
  // Re-export
  jaccardSimilarity,
  textSimilarity,
  tokenize,
  
  // Constants
  DEFAULT_MMR_CONFIG,
};