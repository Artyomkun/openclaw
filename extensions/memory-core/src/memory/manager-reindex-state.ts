/**
 * Memory Core Plugin - Oracle Reindex State Module
 * 
 * Oracle-only reindex state management.
 * 
 * RESPONSIBILITIES:
 * - Manage index metadata
 * - Check if index needs reindexing
 * - Track provider identities
 * - Compare configuration changes
 * - Determine index validity
 */

import {
  hashText,
  normalizeExtraMemoryPaths,
  type MemorySource,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";

// ========================================================================
// Types
// ========================================================================

/**
 * Index metadata stored in Oracle.
 */
export type MemoryIndexMeta = {
  model: string;
  provider: string;
  providerKey?: string;
  sources?: MemorySource[];
  scopeHash?: string;
  chunkTokens: number;
  chunkOverlap: number;
  vectorDims?: number;
  ftsTokenizer?: string;
};

/**
 * Index identity state.
 */
export type MemoryIndexIdentityState =
  | { status: "valid" }
  | { status: "missing"; reason: string }
  | { status: "mismatched"; reason: string };

/**
 * Provider identity for indexing.
 */
export type MemoryIndexProviderIdentity = {
  provider: string;
  model: string;
  providerKey: string;
};

// ========================================================================
// Provider Identity
// ========================================================================

/**
 * Resolves provider identities for indexing.
 * 
 * @param params - Provider parameters
 * @param params.provider - Current provider
 * @param params.cacheKeyData - Cache key data
 * @param params.aliases - Provider aliases
 * @returns Array of provider identities
 * 
 * @example
 * ```typescript
 * const identities = resolveMemoryIndexProviderIdentities({
 *   provider: { id: 'openai', model: 'text-embedding-3-small' },
 *   cacheKeyData: { provider: 'openai', model: 'text-embedding-3-small' },
 *   aliases: [{ model: 'text-embedding-ada-002', cacheKeyData: { provider: 'openai', model: 'text-embedding-ada-002' } }]
 * });
 * ```
 */
export function resolveMemoryIndexProviderIdentities(params: {
  provider: { id: string; model: string } | null;
  cacheKeyData?: Record<string, unknown>;
  aliases?: Array<{ model: string; cacheKeyData: Record<string, unknown> }>;
}): MemoryIndexProviderIdentity[] {
  const provider = params.provider ?? { id: "none", model: "fts-only" };
  
  // Build candidate list
  const candidates = [
    {
      model: provider.model,
      cacheKeyData: params.cacheKeyData ?? { provider: provider.id, model: provider.model },
    },
    ...(params.provider ? (params.aliases ?? []) : []),
  ];

  // Deduplicate by model + providerKey
  const seen = new Set<string>();
  const identities: MemoryIndexProviderIdentity[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const providerKey = hashText(JSON.stringify(candidate.cacheKeyData));
    const key = `${candidate.model}\u0000${providerKey}`;
    
    // Skip if model is empty or already seen
    if ((index > 0 && !candidate.model) || seen.has(key)) {
      continue;
    }
    
    seen.add(key);
    identities.push({
      provider: provider.id,
      model: candidate.model,
      providerKey,
    });
  }

  return identities;
}

// ========================================================================
// Sources
// ========================================================================

/**
 * Resolves configured sources for metadata.
 * 
 * @param sources - Source iterable
 * @returns Normalized sources array
 * 
 * @example
 * ```typescript
 * const sources = resolveConfiguredSourcesForMeta(['memory', 'sessions', 'other']);
 * // Returns: ['memory', 'sessions']
 * ```
 */
export function resolveConfiguredSourcesForMeta(sources: Iterable<MemorySource>): MemorySource[] {
  const normalized = Array.from(sources)
    .filter((source): source is MemorySource => source === "memory" || source === "sessions")
    .toSorted((left, right) => left.localeCompare(right));
  
  return normalized.length > 0 ? normalized : ["memory"];
}

/**
 * Normalizes sources from metadata.
 * 
 * @param meta - Index metadata
 * @returns Normalized sources array
 */
function normalizeMetaSources(meta: MemoryIndexMeta): MemorySource[] {
  if (!Array.isArray(meta.sources)) {
    // Backward compatibility for older indexes
    return ["memory"];
  }

  const normalized = Array.from(
    new Set(
      meta.sources.filter(
        (source): source is MemorySource => source === "memory" || source === "sessions",
      ),
    ),
  ).toSorted((left, right) => left.localeCompare(right));

  return normalized.length > 0 ? normalized : ["memory"];
}

/**
 * Checks if configured sources differ from metadata sources.
 * 
 * @param params - Comparison parameters
 * @param params.meta - Index metadata
 * @param params.configuredSources - Configured sources
 * @returns True if sources differ
 */
function configuredMetaSourcesDiffer(params: {
  meta: MemoryIndexMeta;
  configuredSources: MemorySource[];
}): boolean {
  const metaSources = normalizeMetaSources(params.meta);
  
  if (metaSources.length !== params.configuredSources.length) {
    return true;
  }
  
  return metaSources.some((source, index) => source !== params.configuredSources[index]);
}

// ========================================================================
// Scope Hash
// ========================================================================

/**
 * Resolves configured scope hash.
 * 
 * Used to detect changes in workspace configuration.
 * 
 * @param params - Scope parameters
 * @param params.workspaceDir - Workspace directory
 * @param params.extraPaths - Extra paths
 * @param params.multimodal - Multimodal configuration
 * @returns Scope hash
 * 
 * @example
 * ```typescript
 * const hash = resolveConfiguredScopeHash({
 *   workspaceDir: '/path/to/workspace',
 *   extraPaths: ['/path/to/extra'],
 *   multimodal: { enabled: true, modalities: ['image'], maxFileBytes: 1048576 }
 * });
 * ```
 */
export function resolveConfiguredScopeHash(params: {
  workspaceDir: string;
  extraPaths?: string[];
  multimodal: {
    enabled: boolean;
    modalities: string[];
    maxFileBytes: number;
  };
}): string {
  const extraPaths = normalizeExtraMemoryPaths(params.workspaceDir, params.extraPaths)
    .map((value) => value.replace(/\\/g, "/"))
    .toSorted();

  return hashText(
    JSON.stringify({
      extraPaths,
      multimodal: {
        enabled: params.multimodal.enabled,
        modalities: [...params.multimodal.modalities].toSorted(),
        maxFileBytes: params.multimodal.maxFileBytes,
      },
    }),
  );
}

// ========================================================================
// Index Identity
// ========================================================================

/**
 * Checks if index identity is dirty (needs reindex).
 * 
 * @param params - Check parameters
 * @returns True if index needs reindex
 * 
 * @example
 * ```typescript
 * const isDirty = isMemoryIndexIdentityDirty({
 *   meta: indexMeta,
 *   provider: { id: 'openai', model: 'text-embedding-3-small' },
 *   configuredSources: ['memory', 'sessions'],
 *   configuredScopeHash: 'abc123',
 *   chunkTokens: 500,
 *   chunkOverlap: 50,
 *   vectorReady: true,
 *   ftsTokenizer: 'unicode61'
 * });
 * ```
 */
export function isMemoryIndexIdentityDirty(params: {
  meta: MemoryIndexMeta | null;
  provider: { id: string; model: string } | null;
  providerKey?: string;
  providerAliases?: Array<Pick<MemoryIndexProviderIdentity, "model" | "providerKey">>;
  providerKeyKnown?: boolean;
  configuredSources: MemorySource[];
  configuredScopeHash: string;
  chunkTokens: number;
  chunkOverlap: number;
  vectorReady: boolean;
  hasIndexedChunks?: boolean;
  ftsTokenizer: string;
}): boolean {
  return resolveMemoryIndexIdentityState(params).status !== "valid";
}

/**
 * Resolves index identity state.
 * 
 * Checks all possible reasons for index invalidation:
 * 1. Missing metadata
 * 2. Model mismatch
 * 3. Provider mismatch
 * 4. Source mismatch
 * 5. Scope mismatch
 * 6. Chunking mismatch
 * 7. Vector mismatch
 * 8. FTS tokenizer mismatch
 * 
 * @param params - State parameters
 * @returns Index identity state
 * 
 * @example
 * ```typescript
 * const state = resolveMemoryIndexIdentityState({
 *   meta: indexMeta,
 *   provider: { id: 'openai', model: 'text-embedding-3-small' },
 *   configuredSources: ['memory'],
 *   configuredScopeHash: 'abc123',
 *   chunkTokens: 500,
 *   chunkOverlap: 50,
 *   vectorReady: true,
 *   ftsTokenizer: 'unicode61'
 * });
 * 
 * if (state.status === 'valid') {
 *   // Index is valid, no reindex needed
 * } else {
 *   // Index needs reindex
 *   console.log(state.reason);
 * }
 * ```
 */
export function resolveMemoryIndexIdentityState(params: {
  meta: MemoryIndexMeta | null;
  provider: { id: string; model: string } | null;
  providerKey?: string;
  providerAliases?: Array<Pick<MemoryIndexProviderIdentity, "model" | "providerKey">>;
  providerKeyKnown?: boolean;
  configuredSources: MemorySource[];
  configuredScopeHash: string;
  chunkTokens: number;
  chunkOverlap: number;
  vectorReady: boolean;
  hasIndexedChunks?: boolean;
  ftsTokenizer: string;
}): MemoryIndexIdentityState {
  const { meta } = params;

  // 1. Check if metadata exists
  if (!meta) {
    return { status: "missing", reason: "index metadata is missing" };
  }

  // 2. Check model match
  const expectedModel = params.provider?.model?.trim() || "fts-only";
  const matchingModelIdentities = [
    { model: expectedModel, providerKey: params.providerKey },
    ...(params.providerAliases ?? []),
  ].filter((identity) => identity.model === meta.model);

  if (matchingModelIdentities.length === 0) {
    return {
      status: "mismatched",
      reason: `index was built for model ${meta.model}, expected ${expectedModel}`,
    };
  }

  // 3. Check provider match
  const expectedProvider = params.provider ? params.provider.id : "none";
  if (meta.provider !== expectedProvider) {
    return {
      status: "mismatched",
      reason: `index was built for provider ${meta.provider}, expected ${expectedProvider}`,
    };
  }

  // 4. Check provider key match
  if (
    params.providerKeyKnown !== false &&
    !matchingModelIdentities.some((identity) => identity.providerKey === meta.providerKey)
  ) {
    return {
      status: "mismatched",
      reason: "index provider settings changed",
    };
  }

  // 5. Check sources match
  if (
    configuredMetaSourcesDiffer({
      meta,
      configuredSources: params.configuredSources,
    })
  ) {
    return {
      status: "mismatched",
      reason: "index sources changed",
    };
  }

  // 6. Check scope hash match
  if (meta.scopeHash !== params.configuredScopeHash) {
    return {
      status: "mismatched",
      reason: "index scope changed",
    };
  }

  // 7. Check chunking settings match
  if (meta.chunkTokens !== params.chunkTokens || meta.chunkOverlap !== params.chunkOverlap) {
    return {
      status: "mismatched",
      reason: "index chunking changed",
    };
  }

  // 8. Check vector dimensions exist if vector is ready
  if (params.vectorReady && params.hasIndexedChunks !== false && !meta.vectorDims) {
    return {
      status: "mismatched",
      reason: "index vector dimensions are missing",
    };
  }

  // 9. Check FTS tokenizer match
  if ((meta.ftsTokenizer ?? "unicode61") !== params.ftsTokenizer) {
    return {
      status: "mismatched",
      reason: "index FTS tokenizer changed",
    };
  }

  // All checks passed - index is valid
  return { status: "valid" };
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Provider identity
  resolveMemoryIndexProviderIdentities,
  
  // Sources
  resolveConfiguredSourcesForMeta,
  
  // Scope hash
  resolveConfiguredScopeHash,
  
  // Index identity
  isMemoryIndexIdentityDirty,
  resolveMemoryIndexIdentityState,
};