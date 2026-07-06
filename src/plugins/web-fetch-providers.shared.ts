// Shares web fetch provider loading helpers across provider plugins.
import type { PluginLoadOptions } from "./loader.ts";
import type { PluginWebFetchProviderEntry } from "./types.ts";
import {
  resolveBundledWebProviderResolutionConfig,
  sortPluginProviders,
  sortPluginProvidersForAutoDetect,
} from "./web-provider-resolution-shared.ts";

export function sortWebFetchProviders(
  providers: PluginWebFetchProviderEntry[],
): PluginWebFetchProviderEntry[] {
  return sortPluginProviders(providers);
}

export function sortWebFetchProvidersForAutoDetect(
  providers: PluginWebFetchProviderEntry[],
): PluginWebFetchProviderEntry[] {
  return sortPluginProvidersForAutoDetect(providers);
}

export function resolveBundledWebFetchResolutionConfig(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
}): {
  config: PluginLoadOptions["config"];
  activationSourceConfig?: PluginLoadOptions["config"];
  autoEnabledReasons: Record<string, string[]>;
} {
  return resolveBundledWebProviderResolutionConfig({
    contract: "webFetchProviders",
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
  });
}
