/**
 * Memory Core - Provider Adapters
 */

import {
  getEmbeddingProvider,
  type EmbeddingProvider as GenericEmbeddingProvider,
  type EmbeddingProviderRuntime as GenericEmbeddingProviderRuntime,
} from "openclaw/plugin-sdk/embedding-providers";
import {
  type MemoryEmbeddingProvider,
  type MemoryEmbeddingProviderRuntime,
} from "openclaw/plugin-sdk/memory-core-host-engine-embeddings";

// ========================================================================
// Просто адаптеры
// ========================================================================

export function adaptProvider(provider: GenericEmbeddingProvider): MemoryEmbeddingProvider {
  return {
    id: provider.id,
    model: provider.model,
    maxInputTokens: provider.maxInputTokens,
    embedQuery: async (text, options) => provider.embed(text, { ...options, inputType: "query" }),
    embedBatch: async (texts, options) => provider.embedBatch(texts, { ...options, inputType: "document" }),
    embedBatchInputs: async (inputs, options) => provider.embedBatch(inputs, { ...options, inputType: "document" }),
    close: provider.close,
  };
}

export function adaptRuntime(runtime: GenericEmbeddingProviderRuntime | undefined): MemoryEmbeddingProviderRuntime | undefined {
  if (!runtime) return undefined;
  return {
    id: runtime.id,
    cacheKeyData: runtime.cacheKeyData,
    indexIdentityAliases: runtime.indexIdentityAliases,
    inlineQueryTimeoutMs: runtime.inlineQueryTimeoutMs,
    inlineBatchTimeoutMs: runtime.inlineBatchTimeoutMs,
  };
}

export function getAdapter(providerId: string, config?: any) {
  const adapter = getEmbeddingProvider(providerId, config);
  if (!adapter) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return adapter;
}

export function resolveModel(adapter: any, requestedModel: string): string {
  return requestedModel?.trim() || adapter.defaultModel || "";
}