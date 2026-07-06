/**
 * Memory Core Plugin - Embedding Provider Module
 */

import {
  getEmbeddingProvider,
  type EmbeddingProvider as GenericEmbeddingProvider,
  type EmbeddingProviderRuntime as GenericEmbeddingProviderRuntime,
} from "openclaw/plugin-sdk/embedding-providers";
import {
  type MemoryEmbeddingProvider,
  type MemoryEmbeddingProviderCreateOptions,
  type MemoryEmbeddingProviderRuntime,
} from "openclaw/plugin-sdk/memory-core-host-engine-embeddings";
import { formatErrorMessage } from "../dreaming-shared.js";

// ========================================================================
// Types
// ========================================================================

export type EmbeddingProvider = MemoryEmbeddingProvider;
export type EmbeddingProviderId = string;
export type EmbeddingProviderRequest = string;
export type EmbeddingProviderRuntime = MemoryEmbeddingProviderRuntime;

export type EmbeddingProviderResult = {
  provider: EmbeddingProvider | null;
  requestedProvider: EmbeddingProviderRequest;
  fallbackFrom?: string;
  fallbackReason?: string;
  providerUnavailableReason?: string;
  runtime?: EmbeddingProviderRuntime;
};

type CreateEmbeddingProviderOptions = MemoryEmbeddingProviderCreateOptions & {
  provider: EmbeddingProviderRequest;
  fallback?: string;
};

// ========================================================================
// Constants
// ========================================================================

const DEFAULT_PROVIDER = "openai";
const LOCAL_PROVIDER = "local";

// ========================================================================
// Simple Adapter
// ========================================================================

function adaptProvider(
  provider: GenericEmbeddingProvider,
): MemoryEmbeddingProvider {
  return {
    id: provider.id,
    model: provider.model,
    maxInputTokens: provider.maxInputTokens,
    embedQuery: async (text, options) =>
      await provider.embed(text, { ...options, inputType: "query" }),
    embedBatch: async (texts, options) =>
      await provider.embedBatch(texts, { ...options, inputType: "document" }),
    embedBatchInputs: async (inputs, options) =>
      await provider.embedBatch(inputs, { ...options, inputType: "document" }),
    close: provider.close,
  };
}

function adaptRuntime(
  runtime: GenericEmbeddingProviderRuntime | undefined,
): MemoryEmbeddingProviderRuntime | undefined {
  if (!runtime) return undefined;
  return {
    id: runtime.id,
    cacheKeyData: runtime.cacheKeyData,
    indexIdentityAliases: runtime.indexIdentityAliases,
    inlineQueryTimeoutMs: runtime.inlineQueryTimeoutMs,
    inlineBatchTimeoutMs: runtime.inlineBatchTimeoutMs,
  };
}

// ========================================================================
// Core Functions
// ========================================================================

function getAdapter(providerId: string, config?: any) {
  const adapter = getEmbeddingProvider(providerId, config);
  if (!adapter) {
    if (providerId === LOCAL_PROVIDER) {
      throw new Error(
        `Local provider not installed. Run: openclaw plugins install @openclaw/llama-cpp-provider`
      );
    }
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return adapter;
}

function resolveModel(adapter: any, requestedModel: string): string {
  return requestedModel?.trim() || adapter.defaultModel || "";
}

// ========================================================================
// Create Provider
// ========================================================================

export async function createEmbeddingProvider(
  options: CreateEmbeddingProviderOptions,
): Promise<EmbeddingProviderResult> {
  const providerId = options.provider === "auto" ? DEFAULT_PROVIDER : options.provider;
  const adapter = getAdapter(providerId, options.config);
  const model = resolveModel(adapter, options.model);

  try {
    const result = await adapter.create({ ...options, model });
    return {
      provider: result.provider ? adaptProvider(result.provider) : null,
      requestedProvider: options.provider,
      runtime: adaptRuntime(result.runtime),
    };
  } catch (error) {
    if (options.fallback && options.fallback !== "none" && options.fallback !== providerId) {
      try {
        const fallbackAdapter = getAdapter(options.fallback, options.config);
        const result = await fallbackAdapter.create({
          ...options,
          provider: options.fallback,
          model: resolveModel(fallbackAdapter, options.model),
        });
        return {
          provider: result.provider ? adaptProvider(result.provider) : null,
          requestedProvider: options.provider,
          fallbackFrom: providerId,
          fallbackReason: formatErrorMessage(error),
          runtime: adaptRuntime(result.runtime),
        };
      } catch (fallbackError) {
        throw new Error(
          `Primary failed: ${formatErrorMessage(error)}\nFallback failed: ${formatErrorMessage(fallbackError)}`
        );
      }
    }
    throw new Error(`Provider ${providerId} failed: ${formatErrorMessage(error)}`);
  }
}

// ========================================================================
// Helpers
// ========================================================================

export function resolveEmbeddingProviderFallbackModel(
  providerId: string,
  fallbackSourceModel: string,
  config?: any,
): string {
  const adapter = getEmbeddingProvider(providerId, config);
  return adapter?.defaultModel ?? fallbackSourceModel;
}

export function resolveEmbeddingProviderAdapterTransport(
  providerId: string,
  config?: any,
): string | undefined {
  try {
    return getAdapter(providerId, config).transport;
  } catch {
    return undefined;
  }
}