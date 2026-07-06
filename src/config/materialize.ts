// Materializes normalized config into runtime-ready settings.
import type { PluginManifestRegistry } from "../plugins/manifest-registry.ts";
import {
  applyCompactionDefaults,
  applyContextPruningDefaults,
  applyAgentDefaults,
  applyCronDefaults,
  applyLoggingDefaults,
  applyMessageDefaults,
  applyModelDefaults,
  applySessionDefaults,
  applyTalkConfigNormalization,
} from "./defaults.ts";
import { normalizeExecSafeBinProfilesInConfig } from "./normalize-exec-safe-bin.ts";
import { normalizeConfigPaths } from "./normalize-paths.ts";
import type { OpenClawConfig, ResolvedSourceConfig, RuntimeConfig } from "./types.ts";

type ConfigMaterializationMode = "load" | "missing" | "snapshot";

/** Defaults profile selected for config load, missing-file, or snapshot materialization. */
type MaterializationProfile = {
  includeCompactionDefaults: boolean;
  includeContextPruningDefaults: boolean;
  includeLoggingDefaults: boolean;
  normalizePaths: boolean;
};

const MATERIALIZATION_PROFILES: Record<ConfigMaterializationMode, MaterializationProfile> = {
  load: {
    includeCompactionDefaults: true,
    includeContextPruningDefaults: true,
    includeLoggingDefaults: true,
    normalizePaths: true,
  },
  missing: {
    includeCompactionDefaults: true,
    includeContextPruningDefaults: true,
    includeLoggingDefaults: false,
    normalizePaths: false,
  },
  snapshot: {
    includeCompactionDefaults: false,
    includeContextPruningDefaults: false,
    includeLoggingDefaults: true,
    normalizePaths: true,
  },
};

export function asResolvedSourceConfig(config: OpenClawConfig): ResolvedSourceConfig {
  return config as ResolvedSourceConfig;
}

export function asRuntimeConfig(config: OpenClawConfig): RuntimeConfig {
  return config as RuntimeConfig;
}

export function materializeRuntimeConfig(
  config: OpenClawConfig,
  mode: ConfigMaterializationMode,
  options: {
    manifestRegistry?: Pick<PluginManifestRegistry, "plugins">;
    loadManifestRegistry?: () => Pick<PluginManifestRegistry, "plugins"> | undefined;
  } = {},
): RuntimeConfig {
  const profile = MATERIALIZATION_PROFILES[mode];
  let next = applyMessageDefaults(config);
  if (profile.includeLoggingDefaults) {
    next = applyLoggingDefaults(next);
  }
  next = applySessionDefaults(next);
  next = applyAgentDefaults(next);
  next = applyCronDefaults(next);
  if (profile.includeContextPruningDefaults) {
    next = applyContextPruningDefaults(next, { manifestRegistry: options.manifestRegistry });
  }
  if (profile.includeCompactionDefaults) {
    next = applyCompactionDefaults(next);
  }
  next = applyModelDefaults(next, {
    manifestRegistry: options.manifestRegistry,
    loadManifestRegistry: options.loadManifestRegistry,
  });
  next = applyTalkConfigNormalization(next);
  if (profile.normalizePaths) {
    normalizeConfigPaths(next);
  }
  normalizeExecSafeBinProfilesInConfig(next);
  return asRuntimeConfig(next);
}
