// Capability registry used to decide which shared media model entries are
// eligible for image/audio/video understanding.
import type { OpenClawConfig } from "../config/types.ts";
import { resolvePluginCapabilityProviders } from "../plugins/capability-provider-runtime.ts";
import { resolveImageCapableConfigProviderIds } from "./config-provider-models.ts";
import { normalizeMediaProviderId } from "./provider-id.ts";
import type { MediaUnderstandingCapabilityRegistry, MediaUnderstandingProvider } from "./types.ts";

function mergeProviderCapabilities(
  registry: MediaUnderstandingCapabilityRegistry,
  provider: Pick<MediaUnderstandingProvider, "id" | "capabilities">,
) {
  const normalizedKey = normalizeMediaProviderId(provider.id);
  const existing = registry.get(normalizedKey);
  registry.set(normalizedKey, {
    capabilities: provider.capabilities ?? existing?.capabilities,
  });
}

/** Builds provider capability metadata used to filter shared media model entries. */
export function buildMediaUnderstandingCapabilityRegistry(
  cfg?: OpenClawConfig,
): MediaUnderstandingCapabilityRegistry {
  const registry: MediaUnderstandingCapabilityRegistry = new Map();

  for (const provider of resolvePluginCapabilityProviders({
    key: "mediaUnderstandingProviders",
    cfg,
  })) {
    mergeProviderCapabilities(registry, provider);
  }

  for (const normalizedKey of resolveImageCapableConfigProviderIds(cfg)) {
    // Plugin declarations own provider capability truth; config auto-registration only fills gaps.
    if (!registry.has(normalizedKey)) {
      mergeProviderCapabilities(registry, {
        id: normalizedKey,
        capabilities: ["image"],
      });
    }
  }

  return registry;
}
