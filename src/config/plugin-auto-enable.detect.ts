// Detects plugin auto-enable candidates from config and discovery results.
import type { PluginDiscoveryResult } from "../plugins/discovery.ts";
import type { PluginManifestRegistry } from "../plugins/manifest-registry.ts";
import {
  resolveConfiguredPluginAutoEnableCandidates,
  resolvePluginAutoEnableReadiness,
  resolvePluginAutoEnableManifestRegistry,
} from "./plugin-auto-enable.shared.ts";
import type { PluginAutoEnableCandidate } from "./plugin-auto-enable.types.ts";
import type { OpenClawConfig } from "./types.openclaw.ts";

/** Detects installed plugins that should become enabled from existing config usage. */
export function detectPluginAutoEnableCandidates(params: {
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  manifestRegistry?: PluginManifestRegistry;
  discovery?: PluginDiscoveryResult;
}): PluginAutoEnableCandidate[] {
  const env = params.env ?? process.env;
  const config = params.config ?? ({} as OpenClawConfig);
  const readiness = resolvePluginAutoEnableReadiness(config, env, params.discovery);
  if (!readiness.mayNeedAutoEnable) {
    return [];
  }
  const registry = resolvePluginAutoEnableManifestRegistry({
    config,
    env,
    manifestRegistry: params.manifestRegistry,
  });
  return resolveConfiguredPluginAutoEnableCandidates({
    config,
    env,
    registry,
    configuredChannelIds: readiness.configuredChannelIds,
  });
}
