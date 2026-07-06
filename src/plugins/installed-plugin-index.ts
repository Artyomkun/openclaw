/** Public installed-plugin-index API for load, refresh, policy hash, and invalidation checks. */
import type { OpenClawConfig } from "../config/types.ts";
import { resolveCompatibilityHostVersion } from "../version.ts";
import { normalizePluginsConfig, resolveEffectivePluginActivationState } from "./config-state.ts";
import { isPluginEnabledByDefaultForPlatform } from "./default-enablement.ts";
import type { PluginDiscoveryResult } from "./discovery.ts";
import { normalizeInstallRecordMap } from "./installed-plugin-index-install-records.ts";
import {
  resolveCompatRegistryVersion,
  resolveInstalledPluginIndexPolicyHash,
} from "./installed-plugin-index-policy.ts";
import { buildInstalledPluginIndexRecords } from "./installed-plugin-index-record-builder.ts";
import { loadInstalledPluginIndexInstallRecordsSync } from "./installed-plugin-index-record-reader.ts";
import { resolveInstalledPluginIndexRegistry } from "./installed-plugin-index-registry.ts";
import {
  INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
  INSTALLED_PLUGIN_INDEX_VERSION,
  INSTALLED_PLUGIN_INDEX_WARNING,
  type InstalledPluginIndex,
  type InstalledPluginIndexRecord,
  type InstalledPluginIndexRefreshReason,
  type LoadInstalledPluginIndexParams,
  type RefreshInstalledPluginIndexParams,
} from "./installed-plugin-index-types.ts";

export {
  INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
  INSTALLED_PLUGIN_INDEX_VERSION,
  INSTALLED_PLUGIN_INDEX_WARNING,
} from "./installed-plugin-index-types.ts";
export type {
  InstalledPluginIndex,
  InstalledPluginIndexRecord,
  InstalledPluginIndexRefreshReason,
  InstalledPluginInstallRecordInfo,
  InstalledPluginPackageChannelInfo,
  InstalledPluginStartupInfo,
  LoadInstalledPluginIndexParams,
  RefreshInstalledPluginIndexParams,
} from "./installed-plugin-index-types.ts";
export { extractPluginInstallRecordsFromInstalledPluginIndex } from "./installed-plugin-index-install-records.ts";
export { diffInstalledPluginIndexInvalidationReasons } from "./installed-plugin-index-invalidation.ts";
export {
  CONFIG_PATH_ACTIVATION_COMPAT_CODE,
  hasMissingConfigPathActivationMetadata,
} from "./installed-plugin-index-config-path-scope.ts";
export { resolveInstalledPluginIndexPolicyHash } from "./installed-plugin-index-policy.ts";

function buildInstalledPluginIndex(
  params: LoadInstalledPluginIndexParams & { refreshReason?: InstalledPluginIndexRefreshReason },
): { index: InstalledPluginIndex; discovery: PluginDiscoveryResult | undefined } {
  const env = params.env ?? process.env;
  const { candidates, registry, discovery } = resolveInstalledPluginIndexRegistry(params);
  const registryDiagnostics = registry.diagnostics ?? [];
  const diagnostics = [...registryDiagnostics];
  const generatedAtMs = (params.now?.() ?? new Date()).getTime();
  const installRecords = normalizeInstallRecordMap(
    params.installRecords ??
      loadInstalledPluginIndexInstallRecordsSync({
        env,
        ...(params.stateDir ? { stateDir: params.stateDir } : {}),
        ...(params.pluginIndexFilePath ? { filePath: params.pluginIndexFilePath } : {}),
      }),
  );
  const plugins = buildInstalledPluginIndexRecords({
    candidates,
    registry,
    config: params.config,
    diagnostics,
    installRecords,
  });

  return {
    index: {
      version: INSTALLED_PLUGIN_INDEX_VERSION,
      warning: INSTALLED_PLUGIN_INDEX_WARNING,
      hostContractVersion: resolveCompatibilityHostVersion(env),
      compatRegistryVersion: resolveCompatRegistryVersion(),
      migrationVersion: INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
      policyHash: resolveInstalledPluginIndexPolicyHash(params.config),
      generatedAtMs,
      ...(params.refreshReason ? { refreshReason: params.refreshReason } : {}),
      installRecords,
      plugins,
      diagnostics,
    },
    discovery,
  };
}

export function loadInstalledPluginIndex(
  params: LoadInstalledPluginIndexParams = {},
): InstalledPluginIndex {
  return buildInstalledPluginIndex(params).index;
}

export function loadInstalledPluginIndexWithDiscovery(
  params: LoadInstalledPluginIndexParams = {},
): { index: InstalledPluginIndex; discovery: PluginDiscoveryResult | undefined } {
  return buildInstalledPluginIndex(params);
}

export function refreshInstalledPluginIndex(
  params: RefreshInstalledPluginIndexParams,
): InstalledPluginIndex {
  return buildInstalledPluginIndex({ ...params, refreshReason: params.reason }).index;
}

export function listInstalledPluginRecords(
  index: InstalledPluginIndex,
): readonly InstalledPluginIndexRecord[] {
  return index.plugins;
}

export function listEnabledInstalledPluginRecords(
  index: InstalledPluginIndex,
  config?: OpenClawConfig,
): readonly InstalledPluginIndexRecord[] {
  if (!config) {
    return index.plugins.filter((plugin) => plugin.enabled);
  }
  return index.plugins.filter((plugin) => isInstalledPluginEnabled(index, plugin.pluginId, config));
}

export function getInstalledPluginRecord(
  index: InstalledPluginIndex,
  pluginId: string,
): InstalledPluginIndexRecord | undefined {
  return index.plugins.find((plugin) => plugin.pluginId === pluginId);
}

export function isInstalledPluginEnabled(
  index: InstalledPluginIndex,
  pluginId: string,
  config?: OpenClawConfig,
): boolean {
  const record = getInstalledPluginRecord(index, pluginId);
  if (!record) {
    return false;
  }
  if (!config) {
    return record.enabled;
  }
  const normalizedConfig = normalizePluginsConfig(config?.plugins);
  const state = resolveEffectivePluginActivationState({
    id: record.pluginId,
    origin: record.origin,
    config: normalizedConfig,
    rootConfig: config,
    enabledByDefault: isPluginEnabledByDefaultForPlatform(record),
  });
  return state.enabled && (record.enabled || state.explicitlyEnabled);
}
