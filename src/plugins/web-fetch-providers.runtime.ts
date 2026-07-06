/** Runtime resolver for plugin-contributed web fetch providers. */
import { loadOpenClawPlugins } from "./loader.ts";
import type { PluginLoadOptions } from "./loader.ts";
import type { PluginManifestRecord } from "./manifest-registry.ts";
import type { PluginWebFetchProviderEntry } from "./types.ts";
import {
  resolveBundledWebFetchResolutionConfig,
  sortWebFetchProviders,
} from "./web-fetch-providers.shared.ts";
import { resolveBundledWebFetchProvidersFromPublicArtifacts } from "./web-provider-public-artifacts.ts";
import {
  mapRegistryProviders,
  resolveManifestDeclaredWebProviderCandidatePluginIds,
} from "./web-provider-resolution-shared.ts";
import {
  resolvePluginWebProviders,
  resolveRuntimeWebProviders,
} from "./web-provider-runtime-shared.ts";

function resolveWebFetchCandidatePluginIds(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
  onlyPluginIds?: readonly string[];
  origin?: PluginManifestRecord["origin"];
  sandboxed?: boolean;
}): string[] | undefined {
  return resolveManifestDeclaredWebProviderCandidatePluginIds({
    contract: "webFetchProviders",
    configKey: "webFetch",
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
    onlyPluginIds: params.onlyPluginIds,
    origin: params.origin,
    sandboxed: params.sandboxed,
  });
}

function mapRegistryWebFetchProviders(params: {
  registry: ReturnType<typeof loadOpenClawPlugins>;
  onlyPluginIds?: readonly string[];
}): PluginWebFetchProviderEntry[] {
  return mapRegistryProviders({
    entries: params.registry.webFetchProviders,
    onlyPluginIds: params.onlyPluginIds,
    sortProviders: sortWebFetchProviders,
  });
}

/** Resolves web fetch providers, activating plugin runtimes when requested. */
export function resolvePluginWebFetchProviders(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
  onlyPluginIds?: readonly string[];
  activate?: boolean;
  cache?: boolean;
  mode?: "runtime" | "setup";
  origin?: PluginManifestRecord["origin"];
  sandboxed?: boolean;
}): PluginWebFetchProviderEntry[] {
  return resolvePluginWebProviders(params, {
    resolveBundledResolutionConfig: resolveBundledWebFetchResolutionConfig,
    resolveCandidatePluginIds: resolveWebFetchCandidatePluginIds,
    mapRegistryProviders: mapRegistryWebFetchProviders,
    resolveBundledPublicArtifactProviders: resolveBundledWebFetchProvidersFromPublicArtifacts,
  });
}

/** Resolves already-eligible runtime web fetch providers without setup-mode activation. */
export function resolveRuntimeWebFetchProviders(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
  onlyPluginIds?: readonly string[];
  origin?: PluginManifestRecord["origin"];
}): PluginWebFetchProviderEntry[] {
  return resolveRuntimeWebProviders(params, {
    resolveBundledResolutionConfig: resolveBundledWebFetchResolutionConfig,
    resolveCandidatePluginIds: resolveWebFetchCandidatePluginIds,
    mapRegistryProviders: mapRegistryWebFetchProviders,
  });
}
