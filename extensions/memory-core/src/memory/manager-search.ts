/**
 * Memory Core Plugin - Oracle Search Module
 * 
 * Oracle-only search functionality for memory index.
 * 
 * RESPONSIBILITIES:
 * - Vector similarity search (Oracle AI Vector Search)
 * - Full-text search (Oracle Text)
 * - Hybrid search (vector + FTS)
 * - Search result ranking and scoring
 * - Snippet generation
 * 
 * ORACLE ONLY - No SQLite compatibility.
 * 
 * ORACLE ADAPTATIONS:
 * - Uses Oracle AI Vector Search for vector similarity
 * - Uses Oracle Text for full-text search
 * - Oracle-specific SQL syntax
 * - Async/await for all operations
 */

import { truncateUtf16Safe } from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import { parseEmbedding } from "openclaw/plugin-sdk/memory-core-host-engine-storage";
import { normalizeStringEntriesLower } from "openclaw/plugin-sdk/string-coerce-runtime";

// ========================================================================
// Constants
// ========================================================================

const FTS_QUERY_TOKEN_RE = /[\p{L}\p{N}_]+/gu;

// ========================================================================
// Types
// ========================================================================

type SearchSource = string;

type SearchRowResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: SearchSource;
};

export interface OracleSearchConfig {
  /** Use Oracle AI Vector Search if available */
  useAIVector?: boolean;
  /** Use Oracle Text if available */
  useText?: boolean;
  /** Vector distance metric: 'COSINE', 'DOT', 'EUCLIDEAN' */
  vectorMetric?: 'COSINE' | 'DOT' | 'EUCLIDEAN';
  /** Oracle Text search options */
  textOptions?: {
    /** Use fuzzy search */
    fuzzy?: boolean;
    /** Use stemming */
    stemming?: boolean;
    /** Use synonyms */
    synonyms?: boolean;
  };
}

// ========================================================================
// Utility Functions
// ========================================================================

function normalizeSearchTokens(raw: string): string[] {
  return normalizeStringEntriesLower(raw.match(FTS_QUERY_TOKEN_RE) ?? []);
}

function escapeLikePattern(term: string): string {
  return term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function resolveProviderModels(primary: string, aliases: string[] | undefined): string[] {
  return Array.from(new Set([primary, ...(aliases ?? []).filter(Boolean)]));
}

function buildModelFilter(column: string, models: string[]): string {
  return models.length === 1
    ? `${column} = :model`
    : `${column} IN (${models.map((_, i) => `:model${i}`).join(', ')})`;
}

// ========================================================================
// Vector Search - Oracle AI Vector Search
// ========================================================================

/**
 * Search using Oracle AI Vector Search.
 * 
 * @param params - Vector search parameters
 * @param params.db - Oracle connection
 * @param params.providerModel - Embedding model name
 * @param params.providerModelAliases - Optional model aliases
 * @param params.queryVec - Query vector
 * @param params.limit - Max results
 * @param params.snippetMaxChars - Max snippet length
 * @param params.sourceFilterVec - Source filter
 * @param params.config - Oracle search config
 * @returns Search results
 * 
 * @example
 * ```typescript
 * const results = await searchVector({
 *   db: oracleConnection,
 *   providerModel: 'text-embedding-3-small',
 *   queryVec: [0.1, 0.2, 0.3],
 *   limit: 10,
 *   snippetMaxChars: 700,
 *   sourceFilterVec: { sql: ' AND source IN (:source1, :source2)', params: ['memory', 'sessions'] },
 *   config: { useAIVector: true, vectorMetric: 'COSINE' }
 * });
 * ```
 */
export async function searchVector(params: {
  db: any;
  providerModel: string;
  providerModelAliases?: string[];
  queryVec: number[];
  limit: number;
  snippetMaxChars: number;
  sourceFilterVec: { sql: string; params: SearchSource[] };
  sourceFilterChunks: { sql: string; params: SearchSource[] };
  config?: OracleSearchConfig;
}): Promise<SearchRowResult[]> {
  if (params.queryVec.length === 0 || params.limit <= 0) {
    return [];
  }

  const config = params.config ?? { useAIVector: true };
  const providerModels = resolveProviderModels(params.providerModel, params.providerModelAliases);
  const vectorMetric = config.vectorMetric ?? 'COSINE';
  
  // Build model filter
  const modelFilter = buildModelFilter('c.model', providerModels);
  const modelBinds: Record<string, string> = {};
  providerModels.forEach((model, i) => {
    modelBinds[`model${i}`] = model;
  });

  // Build source filter binds
  const sourceBinds: Record<string, SearchSource> = {};
  params.sourceFilterVec.params.forEach((source, i) => {
    sourceBinds[`src${i}`] = source;
  });

  // Vector to JSON string for Oracle
  const vectorJson = JSON.stringify(params.queryVec);

  try {
    // Try Oracle AI Vector Search first
    const sql = `
      SELECT 
        c.id, c.path, c.start_line, c.end_line, c.text, c.source,
        1 - VECTOR_DISTANCE(v.embedding, :vec, ${vectorMetric}) AS score
      FROM memory_index_chunks_vec v
      JOIN memory_index_chunks c ON c.id = v.id
      WHERE ${modelFilter}
        ${params.sourceFilterVec.sql.replace(/\?/g, (_, i) => `:src${i}`)}
      ORDER BY score DESC
      FETCH FIRST :limit ROWS ONLY
    `;

    const result = await params.db.execute(sql, {
      vec: vectorJson,
      limit: params.limit,
      ...modelBinds,
      ...sourceBinds,
    });

    if (result.rows && result.rows.length > 0) {
      return result.rows.map((row: any) => ({
        id: row[0],
        path: row[1],
        startLine: row[2],
        endLine: row[3],
        score: row[5] ?? 0,
        snippet: truncateUtf16Safe(row[4] || '', params.snippetMaxChars),
        source: row[6] || 'memory',
      }));
    }
  } catch (error) {
    console.warn('Oracle AI Vector Search failed, falling back to manual search:', error);
  }

  // Fallback: manual search
  return await searchChunksByEmbedding({
    db: params.db,
    providerModel: params.providerModel,
    providerModelAliases: params.providerModelAliases,
    sourceFilter: params.sourceFilterChunks,
    queryVec: params.queryVec,
    limit: params.limit,
    snippetMaxChars: params.snippetMaxChars,
  });
}

/**
 * Manual vector search (fallback when AI Vector Search is unavailable).
 */
async function searchChunksByEmbedding(params: {
  db: any;
  providerModel: string;
  providerModelAliases?: string[];
  sourceFilter: { sql: string; params: SearchSource[] };
  queryVec: number[];
  limit: number;
  snippetMaxChars: number;
}): Promise<SearchRowResult[]> {
  if (params.limit <= 0) {
    return [];
  }

  const providerModels = resolveProviderModels(params.providerModel, params.providerModelAliases);
  const modelFilter = buildModelFilter('model', providerModels);
  
  // Build binds
  const modelBinds: Record<string, string> = {};
  providerModels.forEach((model, i) => {
    modelBinds[`model${i}`] = model;
  });

  const sourceBinds: Record<string, SearchSource> = {};
  params.sourceFilter.params.forEach((source, i) => {
    sourceBinds[`src${i}`] = source;
  });

  // Query chunks and calculate similarity manually
  const sql = `
    SELECT id, path, start_line, end_line, text, source, embedding
    FROM memory_index_chunks
    WHERE ${modelFilter}
      ${params.sourceFilter.sql.replace(/\?/g, (_, i) => `:src${i}`)}
    ORDER BY updated_at DESC
    FETCH FIRST :limit ROWS ONLY
  `;

  const result = await params.db.execute(sql, {
    limit: params.limit * 2,
    ...modelBinds,
    ...sourceBinds,
  });

  if (!result.rows) {
    return [];
  }

  // Calculate cosine similarity manually
  const results: SearchRowResult[] = [];
  for (const row of result.rows) {
    const embedding = parseEmbedding(row[6] || '');
    if (embedding.length === 0) continue;
    
    let score = 0;
    for (let i = 0; i < Math.min(params.queryVec.length, embedding.length); i++) {
      score += params.queryVec[i] * embedding[i];
    }
    
    results.push({
      id: row[0],
      path: row[1],
      startLine: row[2],
      endLine: row[3],
      score: Math.max(0, Math.min(1, score)),
      snippet: truncateUtf16Safe(row[4] || '', params.snippetMaxChars),
      source: row[5] || 'memory',
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit);
}

// ========================================================================
// Keyword Search - Oracle Text
// ========================================================================

/**
 * Search using Oracle Text.
 * 
 * @param params - Keyword search parameters
 * @param params.db - Oracle connection
 * @param params.query - Search query
 * @param params.limit - Max results
 * @param params.snippetMaxChars - Max snippet length
 * @param params.sourceFilter - Source filter
 * @param params.config - Oracle search config
 * @returns Search results with text scores
 * 
 * @example
 * ```typescript
 * const results = await searchKeyword({
 *   db: oracleConnection,
 *   query: 'hello world',
 *   limit: 10,
 *   snippetMaxChars: 700,
 *   sourceFilter: { sql: ' AND source IN (:source1, :source2)', params: ['memory', 'sessions'] },
 *   config: { useText: true, textOptions: { fuzzy: true } }
 * });
 * ```
 */
export async function searchKeyword(params: {
  db: any;
  query: string;
  limit: number;
  snippetMaxChars: number;
  sourceFilter: { sql: string; params: SearchSource[] };
  config?: OracleSearchConfig;
}): Promise<Array<SearchRowResult & { textScore: number }>> {
  if (params.limit <= 0) {
    return [];
  }

  const config = params.config ?? { useText: true };
  const tokens = normalizeSearchTokens(params.query);
  
  if (tokens.length === 0) {
    return [];
  }

  // Build source filter binds
  const sourceBinds: Record<string, SearchSource> = {};
  params.sourceFilter.params.forEach((source, i) => {
    sourceBinds[`src${i}`] = source;
  });

  try {
    // Try Oracle Text if available
    if (config.useText) {
      const textOptions = config.textOptions ?? {};
      let queryText = tokens.join(' ');
      
      if (textOptions.fuzzy) {
        queryText = tokens.map(t => `?(${t})`).join(' ');
      }
      if (textOptions.stemming) {
        queryText = tokens.map(t => `$(${t})`).join(' ');
      }

      const sql = `
        SELECT 
          id, path, source, start_line, end_line, text,
          SCORE(1) as score
        FROM memory_index_chunks_fts
        WHERE CONTAINS(text, :query, 1) > 0
          ${params.sourceFilter.sql.replace(/\?/g, (_, i) => `:src${i}`)}
        ORDER BY score DESC
        FETCH FIRST :limit ROWS ONLY
      `;

      const result = await params.db.execute(sql, {
        query: queryText,
        limit: params.limit,
        ...sourceBinds,
      });

      if (result.rows && result.rows.length > 0) {
        return result.rows.map((row: any) => {
          const textScore = (row[5] || 0) / 100;
          return {
            id: row[0],
            path: row[1],
            source: row[2],
            startLine: row[3],
            endLine: row[4],
            score: textScore,
            textScore: textScore,
            snippet: truncateUtf16Safe(row[6] || '', params.snippetMaxChars),
          };
        });
      }
    }
  } catch (error) {
    console.warn('Oracle Text search failed, falling back to LIKE:', error);
  }

  // Fallback: LIKE search
  const likeClause = tokens.map((_, i) => `text LIKE :term${i} ESCAPE '\\'`).join(' AND ');
  const termBinds: Record<string, string> = {};
  tokens.forEach((token, i) => {
    termBinds[`term${i}`] = `%${escapeLikePattern(token)}%`;
  });

  const sql = `
    SELECT id, path, source, start_line, end_line, text
    FROM memory_index_chunks
    WHERE ${likeClause}
      ${params.sourceFilter.sql.replace(/\?/g, (_, i) => `:src${i}`)}
    FETCH FIRST :limit ROWS ONLY
  `;

  const result = await params.db.execute(sql, {
    limit: params.limit,
    ...termBinds,
    ...sourceBinds,
  });

  if (!result.rows) {
    return [];
  }

  return result.rows.map((row: any) => {
    const textScore = 0.5;
    return {
      id: row[0],
      path: row[1],
      source: row[2] || 'memory',
      startLine: row[3] || 0,
      endLine: row[4] || 0,
      score: textScore,
      textScore,
      snippet: truncateUtf16Safe(row[5] || '', params.snippetMaxChars),
    };
  });
}

// ========================================================================
// Export
// ========================================================================

export default {
  searchVector,
  searchKeyword
};