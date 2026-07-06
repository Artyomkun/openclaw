// Hook install runtime helpers resolve archive install behavior behind runtime imports.
import { resolveArchiveKind } from "../infra/archive.ts";
import { pathExists } from "../infra/fs-safe.ts";
import { resolveExistingInstallPath, withExtractedArchiveRoot } from "../infra/install-flow.ts";
import { installFromValidatedNpmSpecArchive } from "../infra/install-from-npm-spec.ts";
import {
  resolveInstallModeOptions,
  resolveTimedInstallModeOptions,
} from "../infra/install-mode-options.ts";
import {
  installPackageDir,
  installPackageDirWithManifestDeps,
} from "../infra/install-package-dir.ts";
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
import { isPathInside, isPathInsideWithRealpath } from "../security/scan-paths.ts";

/** Runtime-only install dependencies for hook install/update paths. */
export type { NpmIntegrityDrift, NpmSpecResolution };

/** Lazy facade kept separate so hook metadata paths do not eagerly load install tooling. */
export {
  ensureInstallTargetAvailable,
  pathExists as fileExists,
  installFromValidatedNpmSpecArchive,
  installPackageDir,
  installPackageDirWithManifestDeps,
  isPathInside,
  isPathInsideWithRealpath,
  readJson as readJsonFile,
  resolveArchiveKind,
  resolveArchiveSourcePath,
  resolveCanonicalInstallTarget,
  resolveExistingInstallPath,
  resolveInstallModeOptions,
  resolveTimedInstallModeOptions,
  withExtractedArchiveRoot,
};
