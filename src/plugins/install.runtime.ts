/** Lazy runtime barrel for plugin installation helpers used by install flows. */
import { resolveArchiveKind } from "../infra/archive.ts";
import { pathExists, root } from "../infra/fs-safe.ts";
import { resolveExistingInstallPath, withExtractedArchiveRoot } from "../infra/install-flow.ts";
import {
  resolveInstallModeOptions,
  resolveTimedInstallModeOptions,
} from "../infra/install-mode-options.ts";
import { installPackageDir } from "../infra/install-package-dir.ts";
import {
  type NpmIntegrityDrift,
  type NpmSpecResolution,
  resolveArchiveSourcePath,
} from "../infra/install-source-utils.ts";
import {
  ensureInstallTargetAvailable,
  resolveCanonicalInstallTarget,
} from "../infra/install-target.ts";
import { readJson } from "../infra/json-files.ts";
import {
  finalizeNpmSpecArchiveInstall,
  installFromNpmSpecArchiveWithInstaller,
} from "../infra/npm-pack-install.ts";
import { validateRegistryNpmSpec } from "../infra/npm-registry-spec.ts";
import { resolveCompatibilityHostVersion, resolveRuntimeServiceVersion } from "../version.ts";
import { detectBundleManifestFormat, loadBundleManifest } from "./bundle-manifest.ts";
import {
  scanInstalledPackageDependencyTree,
  scanBundleInstallSource,
  scanFileInstallSource,
  scanPackageInstallSource,
} from "./install-security-scan.ts";
import {
  getPackageManifestMetadata,
  loadPluginManifest,
  resolvePackageExtensionEntries,
} from "./manifest.ts";
import { checkMinHostVersion } from "./min-host-version.ts";
import { isPathInside } from "./path-safety.ts";

/** npm install resolution metadata re-exported for lazy plugin install callers. */
export type { NpmIntegrityDrift, NpmSpecResolution };

/** Lazy runtime barrel for plugin install helpers used outside the main install module. */
export {
  checkMinHostVersion,
  root,
  detectBundleManifestFormat,
  ensureInstallTargetAvailable,
  pathExists as fileExists,
  finalizeNpmSpecArchiveInstall,
  getPackageManifestMetadata,
  installFromNpmSpecArchiveWithInstaller,
  installPackageDir,
  isPathInside,
  loadBundleManifest,
  loadPluginManifest,
  readJson as readJsonFile,
  resolveArchiveKind,
  resolveArchiveSourcePath,
  resolveCanonicalInstallTarget,
  resolveExistingInstallPath,
  resolveInstallModeOptions,
  resolvePackageExtensionEntries,
  resolveCompatibilityHostVersion,
  resolveRuntimeServiceVersion,
  resolveTimedInstallModeOptions,
  scanInstalledPackageDependencyTree,
  scanBundleInstallSource,
  scanFileInstallSource,
  scanPackageInstallSource,
  validateRegistryNpmSpec,
  withExtractedArchiveRoot,
};
