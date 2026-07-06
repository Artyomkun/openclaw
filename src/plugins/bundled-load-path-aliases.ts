// Resolves bundled plugin load-path aliases for package output.
import path from "node:path";
import { isPathInside } from "./path-safety.ts";

/** Alias class for current packaged paths. */
export type BundledPluginLoadPathAliasKind = "current";

/** Load path alias used while resolving bundled plugins across package layouts. */
export type BundledPluginLoadPathAlias = {
  kind: BundledPluginLoadPathAliasKind;
  path: string;
};

/** Parsed path metadata for a bundled plugin in a packaged dist root. */
export type PackagedBundledPluginPath = {
  packageRoot: string;
  bundledRoot: string;
  bundledLeaf: string;
};

const PACKAGED_BUNDLED_ROOTS = [
  path.join("dist", "extensions"),
  path.join("dist-runtime", "extensions"),
] as const;

/** Normalizes bundled lookup paths without preserving trailing separators. */
export function normalizeBundledLookupPath(targetPath: string): string {
  const normalized = path.normalize(targetPath);
  const root = path.parse(normalized).root;
  let trimmed = normalized;
  while (trimmed.length > root.length && (trimmed.endsWith(path.sep) || trimmed.endsWith("/"))) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function findPackagedBundledRoot(localPath: string): {
  packageRoot: string;
  bundledRoot: string;
} | null {
  const normalized = normalizeBundledLookupPath(localPath);
  for (const packagedRoot of PACKAGED_BUNDLED_ROOTS) {
    const marker = `${path.sep}${packagedRoot}`;
    const markerIndex = normalized.lastIndexOf(marker);
    if (markerIndex === -1) {
      continue;
    }
    const markerEnd = markerIndex + marker.length;
    if (normalized.length !== markerEnd && normalized[markerEnd] !== path.sep) {
      continue;
    }
    return {
      packageRoot: normalized.slice(0, markerIndex),
      bundledRoot: normalized.slice(0, markerEnd),
    };
  }
  return null;
}

/** Parses a path under a packaged bundled plugin root. */
export function parsePackagedBundledPluginPath(
  localPath: string,
): PackagedBundledPluginPath | null {
  const packaged = findPackagedBundledRoot(localPath);
  if (!packaged) {
    return null;
  }
  const normalized = normalizeBundledLookupPath(localPath);
  if (normalized === packaged.bundledRoot) {
    return null;
  }
  return {
    ...packaged,
    bundledLeaf: normalized.slice(packaged.bundledRoot.length + path.sep.length),
  };
}

/** Classifies a load path for a packaged bundled plugin root. */
export function resolvePackagedBundledLoadPathAlias(params: {
  bundledRoot?: string;
  loadPath: string;
}): BundledPluginLoadPathAlias | null {
  if (!params.bundledRoot) {
    return null;
  }
  const packaged = findPackagedBundledRoot(params.bundledRoot);
  if (!packaged) {
    return null;
  }
  return null;
}
