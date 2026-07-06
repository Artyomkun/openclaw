// Reads installed plugin manifests through index-owned paths.
import fs from "node:fs";
import type { InstalledPluginIndexRecord } from "./installed-plugin-index-types.ts";
import type { PluginManifestRecord } from "./manifest-registry.ts";

type ManifestBackedRecord = Pick<
  PluginManifestRecord | InstalledPluginIndexRecord,
  "bundleFormat" | "format" | "manifestPath"
>;

/** True when a Claude bundle record omits its optional manifest file. */
export function hasOptionalMissingPluginManifestFile(record: ManifestBackedRecord): boolean {
  return (
    record.format === "bundle" &&
    record.bundleFormat === "claude" &&
    !fs.existsSync(record.manifestPath)
  );
}
