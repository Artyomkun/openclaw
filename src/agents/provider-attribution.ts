// provider-attribution.ts
import { z } from "zod";
import { normalizeProviderId } from "@openclaw/model-catalog-core/provider-id";
import { listOpenClawPluginManifestMetadata } from "../plugins/manifest-metadata-scan.ts";

// ============================================
// SCHEMAS
// ============================================

const ProviderEndpointClass = z.enum([
  "default", "anthropic-public", "cerebras-native", "chutes-native",
  "deepseek-native", "github-copilot-native", "groq-native",
  "mistral-public", "moonshot-native", "modelstudio-native",
  "nvidia-native", "openai-public", "openai", "opencode-native",
  "azure-openai", "openrouter", "xai-native", "xiaomi-native",
  "zai-native", "google-generative-ai", "google-vertex",
  "local", "custom", "invalid"
]);

const ProviderRequestPolicy = z.object({
  provider: z.string().optional(),
  endpointClass: ProviderEndpointClass,
  usesConfiguredBaseUrl: z.boolean(),
  knownProviderFamily: z.string(),
  attributionProvider: z.string().optional(),
  attributionHeaders: z.record(z.string()).optional(),
  allowsHiddenAttribution: z.boolean(),
  usesKnownNativeOpenAIEndpoint: z.boolean(),
  usesKnownNativeOpenAIRoute: z.boolean(),
  usesVerifiedOpenAIAttributionHost: z.boolean(),
  usesExplicitProxyLikeEndpoint: z.boolean(),
});

const ProviderRequestCapabilities = ProviderRequestPolicy.extend({
  isKnownNativeEndpoint: z.boolean(),
  allowsOpenAIServiceTier: z.boolean(),
  supportsOpenAIReasoningCompatPayload: z.boolean(),
  allowsAnthropicServiceTier: z.boolean(),
  supportsResponsesStoreField: z.boolean(),
  allowsResponsesStore: z.boolean(),
  shouldStripResponsesPromptCache: z.boolean(),
  supportsNativeStreamingUsageCompat: z.boolean(),
  supportsOpenAICompletionsStreamingUsageCompat: z.boolean(),
  compatibilityFamily: z.enum(["moonshot"]).optional(),
});

type ProviderRequestPolicy = z.infer<typeof ProviderRequestPolicy>;
type ProviderRequestCapabilities = z.infer<typeof ProviderRequestCapabilities>;

// ============================================
// CONSTANTS
// ============================================

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const OPENAI_RESPONSES_APIS = new Set([
  "openai-responses", "azure-openai-responses", "openai-chatgpt-responses"
]);

// ============================================
// MANIFEST LOADER (без заглушек)
// ============================================

let manifestCache: Map<string, { endpointClass: string; hosts: string[]; hostSuffixes: string[] }> | null = null;

function loadManifestEndpoints() {
  if (manifestCache) return manifestCache;
  
  manifestCache = new Map();
  for (const { manifest } of listOpenClawPluginManifestMetadata()) {
    const endpoints = manifest.providerEndpoints;
    if (!Array.isArray(endpoints)) continue;
    
    for (const entry of endpoints) {
      if (!entry?.endpointClass) continue;
      const ec = entry.endpointClass;
      if (!ProviderEndpointClass.safeParse(ec).success) continue;
      
      const hosts = Array.isArray(entry.hosts) ? entry.hosts.map(String) : [];
      const suffixes = Array.isArray(entry.hostSuffixes) ? entry.hostSuffixes.map(String) : [];
      
      manifestCache.set(ec, { endpointClass: ec, hosts, hostSuffixes: suffixes });
    }
  }
  return manifestCache;
}

// ============================================
// HELPERS
// ============================================

function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal");
}

function isOpenAIResponsesApi(api: string): boolean {
  return OPENAI_RESPONSES_APIS.has(api);
}

function normalizeHost(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    return url.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function normalizeBaseUrl(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  if (!suffix) return false;
  return suffix.startsWith(".") || suffix.startsWith("-")
    ? host.endsWith(suffix)
    : host === suffix || host.endsWith(`.${suffix}`);
}

function resolveFromManifest(host: string, baseUrl: string): { endpointClass: string; hostname: string } | null {
  const normalized = normalizeBaseUrl(baseUrl);
  const manifest = loadManifestEndpoints();
  
  for (const [_, entry] of manifest) {
    if (entry.hosts.includes(host)) {
      return { endpointClass: entry.endpointClass, hostname: host };
    }
    if (entry.hostSuffixes.some(s => hostMatchesSuffix(host, s))) {
      return { endpointClass: entry.endpointClass, hostname: host };
    }
    if (normalized && entry.hosts.includes(normalized)) {
      return { endpointClass: entry.endpointClass, hostname: host };
    }
  }
  return null;
}

// ============================================
// MAIN EXPORTS
// ============================================

export function resolveProviderEndpoint(baseUrl?: string | null) {
  if (!baseUrl?.trim()) return { endpointClass: "default" as const };
  
  const host = normalizeHost(baseUrl);
  if (!host) return { endpointClass: "invalid" as const };
  if (isLocalHost(host)) return { endpointClass: "local" as const, hostname: host };
  
  const manifest = resolveFromManifest(host, baseUrl);
  if (manifest) {
    const ec = ProviderEndpointClass.safeParse(manifest.endpointClass);
    if (ec.success) return { endpointClass: ec.data, hostname: host };
  }
  
  return { endpointClass: "custom" as const, hostname: host };
}

export function resolveProviderRequestPolicy(
  input: { provider?: string | null; baseUrl?: string | null; api?: string | null },
  _env = process.env
): ProviderRequestPolicy {
  const provider = normalizeProviderId(input.provider ?? "");
  const endpoint = resolveProviderEndpoint(input.baseUrl);
  const usesKnownNative = endpoint.endpointClass === "openai-public" || endpoint.endpointClass === "openai";
  
  return {
    provider: provider || undefined,
    endpointClass: endpoint.endpointClass,
    usesConfiguredBaseUrl: endpoint.endpointClass !== "default",
    knownProviderFamily: provider || "unknown",
    attributionProvider: usesKnownNative ? "openai" : undefined,
    attributionHeaders: undefined,
    allowsHiddenAttribution: usesKnownNative,
    usesKnownNativeOpenAIEndpoint: usesKnownNative,
    usesKnownNativeOpenAIRoute: usesKnownNative,
    usesVerifiedOpenAIAttributionHost: usesKnownNative,
    usesExplicitProxyLikeEndpoint: endpoint.endpointClass === "custom" || endpoint.endpointClass === "openrouter",
  };
}

export function resolveProviderRequestCapabilities(
  input: { provider?: string | null; baseUrl?: string | null; api?: string | null; compat?: any },
  _env = process.env
): ProviderRequestCapabilities {
  const policy = resolveProviderRequestPolicy(input, _env);
  const api = input.api?.toLowerCase() ?? "";
  const isResponses = isOpenAIResponsesApi(api);
  
  return {
    ...policy,
    isKnownNativeEndpoint: policy.endpointClass !== "default" && policy.endpointClass !== "custom",
    allowsOpenAIServiceTier: isResponses && policy.endpointClass === "openai-public",
    supportsOpenAIReasoningCompatPayload: policy.provider === "azure-openai" && isResponses,
    allowsAnthropicServiceTier: policy.provider === "anthropic",
    supportsResponsesStoreField: isResponses,
    allowsResponsesStore: isResponses && policy.endpointClass === "openai-public",
    shouldStripResponsesPromptCache: isResponses && policy.usesExplicitProxyLikeEndpoint,
    supportsNativeStreamingUsageCompat: policy.endpointClass === "moonshot-native",
    supportsOpenAICompletionsStreamingUsageCompat: false,
    compatibilityFamily: undefined,
  };
}