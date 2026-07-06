import { z } from "zod";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";

// ============================================
// SCHEMAS
// ============================================

const ModelSchema = z.object({
  id: z.string(),
  provider: z.string(),
  api: z.string().optional(),
  baseUrl: z.string().optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
  input: z.array(z.string()).optional(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
  }).optional(),
  reasoning: z.boolean().optional(),
  headers: z.record(z.string()).optional(),
});

type ResolvedModel = z.infer<typeof ModelSchema>;

// ============================================
// PLUGIN REGISTRY
// ============================================

interface ProviderPlugin {
  getModel(modelId: string, cfg?: OpenClawConfig): Promise<ResolvedModel | null>;
}

const pluginRegistry = new Map<string, ProviderPlugin>();

export function registerProviderPlugin(provider: string, plugin: ProviderPlugin): void {
  pluginRegistry.set(provider, plugin);
}

// ============================================
// MAIN RESOLVER
// ============================================

export async function resolveModel(
  provider: string,
  modelId: string,
  cfg?: OpenClawConfig
): Promise<ResolvedModel> {
  const providerConfig = cfg?.models?.providers?.[provider];
  if (providerConfig?.models) {
    const configured = providerConfig.models.find((m: any) => m.id === modelId);
    if (configured) {
      return mergeWithDefaults(provider, modelId, configured, providerConfig);
    }
  }

  const plugin = pluginRegistry.get(provider);
  if (plugin) {
    const model = await plugin.getModel(modelId, cfg);
    if (model) return model;
  }

  // 3. Fallback
  if (providerConfig) {
    return {
      id: modelId,
      provider,
      api: providerConfig.api || "openai-completions",
      baseUrl: providerConfig.baseUrl,
      contextWindow: providerConfig.contextWindow || 200000,
      maxTokens: providerConfig.maxTokens || 8192,
      input: providerConfig.input || ["text"],
      cost: providerConfig.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      reasoning: providerConfig.reasoning || false,
      headers: providerConfig.headers || {},
    };
  }

  throw new Error(`Unknown model: ${provider}/${modelId}. Add it to models.providers.${provider}.models[] or install the provider plugin.`);
}

// ============================================
// HELPERS
// ============================================

function mergeWithDefaults(
  provider: string,
  modelId: string,
  source: any,
  providerConfig?: any
): ResolvedModel {
  const defaults = {
    api: "openai-completions",
    contextWindow: 200000,
    maxTokens: 8192,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
    headers: {},
  };

  return {
    id: modelId,
    provider,
    api: source.api || providerConfig?.api || defaults.api,
    baseUrl: source.baseUrl || providerConfig?.baseUrl,
    contextWindow: source.contextWindow || providerConfig?.contextWindow || defaults.contextWindow,
    maxTokens: source.maxTokens || providerConfig?.maxTokens || defaults.maxTokens,
    input: source.input || providerConfig?.input || defaults.input,
    cost: source.cost || providerConfig?.cost || defaults.cost,
    reasoning: source.reasoning ?? providerConfig?.reasoning ?? defaults.reasoning,
    headers: { ...defaults.headers, ...providerConfig?.headers, ...source.headers },
  };
}