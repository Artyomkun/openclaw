// Resolves manifest contracts into runtime-facing plugin capabilities.
import { sortUniqueStrings } from "@openclaw/normalization-core/string-normalization";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import {
  hasManifestContractValue,
  listAvailableManifestContractPlugins,
} from "./manifest-contract-eligibility.ts";
import type { PluginManifestContractListKey } from "./manifest-registry.ts";
import { loadPluginMetadataSnapshot } from "./plugin-metadata-snapshot.ts";

export type ManifestContractRuntimePluginResolution = {
  pluginIds: string[];
  bundledCompatPluginIds: string[];
};

export function resolveManifestContractRuntimePluginResolution(params: {
  cfg?: OpenClawConfig;
  contract: PluginManifestContractListKey;
  value?: string;
}): ManifestContractRuntimePluginResolution {
  const snapshot = loadPluginMetadataSnapshot({
    config: params.cfg ?? {},
    env: process.env,
  });
  const allContractPlugins = snapshot.plugins.filter((plugin) =>
    hasManifestContractValue({
      plugin,
      contract: params.contract,
      value: params.value,
    }),
  );
  const bundledCompatPluginIds = allContractPlugins
    .filter((plugin) => plugin.origin === "bundled")
    .map((plugin) => plugin.id);
  const pluginIds = listAvailableManifestContractPlugins({
    snapshot: { index: snapshot.index, plugins: allContractPlugins },
    contract: params.contract,
    value: params.value,
    config: params.cfg,
  }).map((plugin) => plugin.id);
  return {
    pluginIds: sortUniqueStrings(pluginIds),
    bundledCompatPluginIds: sortUniqueStrings(bundledCompatPluginIds),
  };
}
