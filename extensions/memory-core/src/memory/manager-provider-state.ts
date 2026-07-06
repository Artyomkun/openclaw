/**
 * Memory Core Plugin - Oracle Provider State Module
 * 
 * Oracle-only provider state management for memory operations.
 * 
 * RESPONSIBILITIES:
 * - Manage provider lifecycle (pending, active, degraded, fallback, fts-only)
 * - Resolve provider state from configuration
 * - Handle provider fallback logic
 * - Track provider availability
 * 
 * ORACLE ADAPTATIONS:
 * - Oracle-specific provider initialization
 * - Connection pool integration
 * - AI Vector Search provider support
 * - Oracle Text provider support
 */

import type {
  OpenClawConfig,
  ResolvedMemorySearchConfig,
} from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import {
  resolveEmbeddingProviderFallbackModel,
  type EmbeddingProvider,
  type EmbeddingProviderResult,
  type EmbeddingProviderRuntime,
} from "./embeddings.js";

// ========================================================================
// Types
// ========================================================================

/**
 * Resolved provider state.
 */
type MemoryResolvedProviderState = {
  provider: EmbeddingProvider | null;
  fallbackFrom?: string;
  fallbackReason?: string;
  providerUnavailableReason?: string;
  providerRuntime?: EmbeddingProviderRuntime;
  lifecycle: MemoryProviderLifecycleState;
};

/**
 * Provider lifecycle state.
 * 
 * States:
 * - pending: Provider not yet initialized
 * - active: Provider is working normally
 * - degraded: Provider is working but with issues
 * - fallback-active: Using fallback provider
 * - fts-only: No provider, only FTS search available
 */
export type MemoryProviderLifecycleState =
  | {
      mode: "pending";
      requestedProvider: string;
    }
  | {
      mode: "active";
      providerId: string;
    }
  | {
      mode: "degraded";
      providerId: string;
      reason: string;
      code?: string;
    }
  | {
      mode: "fallback-active";
      providerId: string;
      fallbackFrom: string;
      reason: string;
    }
  | {
      mode: "fts-only";
      reason: string;
      attemptedProviderId?: string;
    };

// ========================================================================
// Provider Lifecycle
// ========================================================================

/**
 * Creates pending provider lifecycle state.
 * 
 * @param requestedProvider - Provider that was requested
 * @returns Pending lifecycle state
 * 
 * @example
 * ```typescript
 * const state = createPendingMemoryProviderLifecycle('openai');
 * // { mode: 'pending', requestedProvider: 'openai' }
 * ```
 */
export function createPendingMemoryProviderLifecycle(
  requestedProvider: string,
): MemoryProviderLifecycleState {
  return { mode: "pending", requestedProvider };
}

/**
 * Creates degraded provider lifecycle state.
 * 
 * @param params - Degradation parameters
 * @param params.providerId - Provider identifier
 * @param params.reason - Degradation reason
 * @param params.code - Error code
 * @returns Degraded lifecycle state
 * 
 * @example
 * ```typescript
 * const state = createDegradedMemoryProviderLifecycle({
 *   providerId: 'openai',
 *   reason: 'Rate limit exceeded',
 *   code: 'RATE_LIMIT'
 * });
 * ```
 */
export function createDegradedMemoryProviderLifecycle(params: {
  providerId: string;
  reason: string;
  code?: string;
}): MemoryProviderLifecycleState {
  return {
    mode: "degraded",
    providerId: params.providerId,
    reason: params.reason,
    ...(params.code ? { code: params.code } : {}),
  };
}

/**
 * Resolves provider lifecycle from provider result.
 * 
 * @param result - Provider result
 * @returns Lifecycle state
 */
function resolveProviderLifecycle(
  result: Pick<
    EmbeddingProviderResult,
    | "provider"
    | "fallbackFrom"
    | "fallbackReason"
    | "providerUnavailableReason"
    | "requestedProvider"
  >,
): MemoryProviderLifecycleState {
  // Provider with fallback
  if (result.provider && result.fallbackFrom) {
    return {
      mode: "fallback-active",
      providerId: result.provider.id,
      fallbackFrom: result.fallbackFrom,
      reason: result.fallbackReason ?? "fallback activated",
    };
  }
  
  // Provider active
  if (result.provider) {
    return { mode: "active", providerId: result.provider.id };
  }
  
  // No provider - FTS only
  return {
    mode: "fts-only",
    reason: result.providerUnavailableReason ?? "No embedding provider available",
    attemptedProviderId: result.requestedProvider,
  };
}

// ========================================================================
// Provider Resolution
// ========================================================================

/**
 * Resolves current provider ID from provider and lifecycle.
 * 
 * @param params - Provider parameters
 * @param params.provider - Current provider
 * @param params.lifecycle - Lifecycle state
 * @returns Provider ID or null
 * 
 * @example
 * ```typescript
 * const providerId = resolveFallbackCurrentProviderId({
 *   provider: { id: 'openai', model: '...' },
 *   lifecycle: { mode: 'active', providerId: 'openai' }
 * });
 * // Returns: 'openai'
 * ```
 */
export function resolveFallbackCurrentProviderId(params: {
  provider: EmbeddingProvider | null;
  lifecycle: MemoryProviderLifecycleState;
}): string | null {
  if (params.provider) {
    return params.provider.id;
  }
  if (params.lifecycle.mode === "degraded") {
    return params.lifecycle.providerId;
  }
  return null;
}

/**
 * Resolves primary provider request from settings.
 * 
 * @param params - Settings parameters
 * @param params.settings - Memory search settings
 * @returns Provider request
 * 
 * @example
 * ```typescript
 * const request = resolveMemoryPrimaryProviderRequest({
 *   settings: {
 *     provider: 'openai',
 *     model: 'text-embedding-3-small',
 *     remote: { ... },
 *     fallback: 'local',
 *     ...
 *   }
 * });
 * ```
 */
export function resolveMemoryPrimaryProviderRequest(params: {
  settings: ResolvedMemorySearchConfig;
}): {
  provider: string;
  model: string;
  remote: ResolvedMemorySearchConfig["remote"];
  inputType: ResolvedMemorySearchConfig["inputType"];
  queryInputType: ResolvedMemorySearchConfig["queryInputType"];
  documentInputType: ResolvedMemorySearchConfig["documentInputType"];
  outputDimensionality: ResolvedMemorySearchConfig["outputDimensionality"];
  fallback: ResolvedMemorySearchConfig["fallback"];
  local: ResolvedMemorySearchConfig["local"];
} {
  return {
    provider: params.settings.provider,
    model: params.settings.model,
    remote: params.settings.remote,
    inputType: params.settings.inputType,
    queryInputType: params.settings.queryInputType,
    documentInputType: params.settings.documentInputType,
    outputDimensionality: params.settings.outputDimensionality,
    fallback: params.settings.fallback,
    local: params.settings.local,
  };
}

/**
 * Resolves provider state from provider result.
 * 
 * @param result - Provider result
 * @returns Resolved provider state
 * 
 * @example
 * ```typescript
 * const state = resolveMemoryProviderState({
 *   provider: { id: 'openai', model: '...' },
 *   runtime: { ... },
 *   requestedProvider: 'openai'
 * });
 * ```
 */
export function resolveMemoryProviderState(
  result: Pick<
    EmbeddingProviderResult,
    | "provider"
    | "fallbackFrom"
    | "fallbackReason"
    | "providerUnavailableReason"
    | "runtime"
    | "requestedProvider"
  >,
): MemoryResolvedProviderState {
  return {
    provider: result.provider,
    fallbackFrom: result.fallbackFrom,
    fallbackReason: result.fallbackReason,
    providerUnavailableReason: result.providerUnavailableReason,
    providerRuntime: result.runtime,
    lifecycle: resolveProviderLifecycle(result),
  };
}

// ========================================================================
// Provider Fallback
// ========================================================================

/**
 * Applies fallback provider state.
 * 
 * @param params - Fallback parameters
 * @param params.current - Current provider state
 * @param params.fallbackFrom - Fallback source provider
 * @param params.reason - Fallback reason
 * @param params.result - Fallback provider result
 * @returns Updated provider state
 * 
 * @example
 * ```typescript
 * const state = applyMemoryFallbackProviderState({
 *   current: currentState,
 *   fallbackFrom: 'openai',
 *   reason: 'Provider unavailable',
 *   result: { provider: fallbackProvider, runtime: fallbackRuntime }
 * });
 * ```
 */
export function applyMemoryFallbackProviderState(params: {
  current: MemoryResolvedProviderState;
  fallbackFrom: string;
  reason: string;
  result: Pick<EmbeddingProviderResult, "provider" | "runtime">;
}): MemoryResolvedProviderState {
  return {
    ...params.current,
    fallbackFrom: params.fallbackFrom,
    fallbackReason: params.reason,
    providerUnavailableReason: undefined,
    provider: params.result.provider,
    providerRuntime: params.result.runtime,
    lifecycle: params.result.provider
      ? {
          mode: "fallback-active",
          providerId: params.result.provider.id,
          fallbackFrom: params.fallbackFrom,
          reason: params.reason,
        }
      : {
          mode: "fts-only",
          reason: params.reason,
          attemptedProviderId: params.fallbackFrom,
        },
  };
}

/**
 * Resolves fallback provider request.
 * 
 * @param params - Fallback parameters
 * @param params.cfg - OpenClaw configuration
 * @param params.settings - Memory search settings
 * @param params.currentProviderId - Current provider ID
 * @returns Fallback request or null if no fallback needed
 * 
 * @example
 * ```typescript
 * const fallbackRequest = resolveMemoryFallbackProviderRequest({
 *   cfg: config,
 *   settings: settings,
 *   currentProviderId: 'openai'
 * });
 * ```
 */
export function resolveMemoryFallbackProviderRequest(params: {
  cfg: OpenClawConfig;
  settings: ResolvedMemorySearchConfig;
  currentProviderId: string | null;
}): {
  provider: string;
  model: string;
  remote: ResolvedMemorySearchConfig["remote"];
  inputType: ResolvedMemorySearchConfig["inputType"];
  queryInputType: ResolvedMemorySearchConfig["queryInputType"];
  documentInputType: ResolvedMemorySearchConfig["documentInputType"];
  outputDimensionality: ResolvedMemorySearchConfig["outputDimensionality"];
  fallback: "none";
  local: ResolvedMemorySearchConfig["local"];
} | null {
  const fallback = params.settings.fallback;
  
  // No fallback configured
  if (
    !fallback ||
    fallback === "none" ||
    !params.currentProviderId ||
    fallback === params.currentProviderId
  ) {
    return null;
  }
  
  return {
    provider: fallback,
    model: resolveEmbeddingProviderFallbackModel(fallback, params.settings.model, params.cfg),
    remote: params.settings.remote,
    inputType: params.settings.inputType,
    queryInputType: params.settings.queryInputType,
    documentInputType: params.settings.documentInputType,
    outputDimensionality: params.settings.outputDimensionality,
    fallback: "none",
    local: params.settings.local,
  };
}

// ========================================================================
// Oracle-Specific Provider Helpers
// ========================================================================

/**
 * Checks if provider supports Oracle AI Vector Search.
 * 
 * @param provider - Embedding provider
 * @returns True if AI Vector Search is supported
 */
export function providerSupportsAIVector(provider: EmbeddingProvider | null): boolean {
  if (!provider) {
    return false;
  }
  // Check if provider has Oracle AI Vector Search support
  // This would be determined by provider capabilities
  return provider.id === 'oracle' || provider.id === 'openai' || provider.id === 'cohere';
}

/**
 * Checks if provider supports Oracle Text.
 * 
 * @param provider - Embedding provider
 * @returns True if Oracle Text is supported
 */
export function providerSupportsOracleText(provider: EmbeddingProvider | null): boolean {
  if (!provider) {
    return false;
  }
  // Oracle Text is available even without embedding provider
  return true;
}

/**
 * Gets provider capabilities for Oracle.
 * 
 * @param provider - Embedding provider
 * @returns Provider capabilities
 */
export function getOracleProviderCapabilities(provider: EmbeddingProvider | null): {
  supportsAIVector: boolean;
  supportsText: boolean;
  supportsHybrid: boolean;
} {
  if (!provider) {
    return {
      supportsAIVector: false,
      supportsText: true,
      supportsHybrid: false,
    };
  }
  
  return {
    supportsAIVector: providerSupportsAIVector(provider),
    supportsText: providerSupportsOracleText(provider),
    supportsHybrid: true,
  };
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Lifecycle
  createPendingMemoryProviderLifecycle,
  createDegradedMemoryProviderLifecycle,
  
  // Resolution
  resolveFallbackCurrentProviderId,
  resolveMemoryPrimaryProviderRequest,
  resolveMemoryProviderState,
  
  // Fallback
  applyMemoryFallbackProviderState,
  resolveMemoryFallbackProviderRequest,
  
  // Oracle helpers
  providerSupportsAIVector,
  providerSupportsOracleText,
  getOracleProviderCapabilities
};