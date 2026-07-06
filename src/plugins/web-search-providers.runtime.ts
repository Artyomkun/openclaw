// Runtime bridge for web-search providers supplied by plugins.
import { loadOpenClawPlugins } from "./loader.ts";
import type { PluginLoadOptions } from "./loader.ts";
import type { PluginManifestRecord } from "./manifest-registry.ts";
import type { PluginWebSearchProviderEntry } from "./types.ts";
import { resolveBundledWebSearchProvidersFromPublicArtifacts } from "./web-provider-public-artifacts.ts";
import {
  mapRegistryProviders,
  resolveManifestDeclaredWebProviderCandidatePluginIds,
} from "./web-provider-resolution-shared.ts";
import {
  resolvePluginWebProviders,
  resolveRuntimeWebProviders,
} from "./web-provider-runtime-shared.ts";
import {
  resolveBundledWebSearchResolutionConfig,
  sortWebSearchProviders,
} from "./web-search-providers.shared.ts";

function resolveWebSearchCandidatePluginIds(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
  onlyPluginIds?: readonly string[];
  origin?: PluginManifestRecord["origin"];
}): string[] | undefined {
  return resolveManifestDeclaredWebProviderCandidatePluginIds({
    contract: "webSearchProviders",
    configKey: "webSearch",
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
    onlyPluginIds: params.onlyPluginIds,
    origin: params.origin,
  });
}

function mapRegistryWebSearchProviders(params: {
  registry: ReturnType<typeof loadOpenClawPlugins>;
  onlyPluginIds?: readonly string[];
}): PluginWebSearchProviderEntry[] {
  return mapRegistryProviders({
    entries: params.registry.webSearchProviders,
    onlyPluginIds: params.onlyPluginIds,
    sortProviders: sortWebSearchProviders,
  });
}

export function resolvePluginWebSearchProviders(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
  onlyPluginIds?: readonly string[];
  activate?: boolean;
  cache?: boolean;
  mode?: "runtime" | "setup";
  origin?: PluginManifestRecord["origin"];
}): PluginWebSearchProviderEntry[] {
  return resolvePluginWebProviders(params, {
    resolveBundledResolutionConfig: resolveBundledWebSearchResolutionConfig,
    resolveCandidatePluginIds: resolveWebSearchCandidatePluginIds,
    mapRegistryProviders: mapRegistryWebSearchProviders,
    resolveBundledPublicArtifactProviders: resolveBundledWebSearchProvidersFromPublicArtifacts,
  });
}

export function resolveRuntimeWebSearchProviders(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
  onlyPluginIds?: readonly string[];
  origin?: PluginManifestRecord["origin"];
}): PluginWebSearchProviderEntry[] {
  return resolveRuntimeWebProviders(params, {
    resolveBundledResolutionConfig: resolveBundledWebSearchResolutionConfig,
    resolveCandidatePluginIds: resolveWebSearchCandidatePluginIds,
    mapRegistryProviders: mapRegistryWebSearchProviders,
  });
}
