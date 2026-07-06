// Loads documented plugin public surfaces while preserving lazy boundaries.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBundledPluginsDir } from "./bundled-dir.ts";
import {
  createPluginModuleLoaderCache,
  type PluginModuleLoaderCache,
} from "./plugin-module-loader-cache.ts";
import { resolveBundledPluginPublicSurfacePath } from "./public-surface-runtime.ts";

const OPENCLAW_PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const publicSurfaceModuleCache = new Map<string, unknown>();
const publicSurfaceLocationCache = new Map<
  string,
  {
    modulePath: string;
    boundaryRoot: string;
  }
>();
const moduleLoaders: PluginModuleLoaderCache = createPluginModuleLoaderCache();

function createResolutionKey(params: { dirName: string; artifactBasename: string }): string {
  const bundledPluginsDir = resolveBundledPluginsDir();
  return `${params.dirName}::${params.artifactBasename}::${bundledPluginsDir ? path.resolve(bundledPluginsDir) : "<default>"}`;
}

function resolvePublicSurfaceLocationUncached(params: {
  dirName: string;
  artifactBasename: string;
}): { modulePath: string; boundaryRoot: string } | null {
  const bundledPluginsDir = resolveBundledPluginsDir();
  const modulePath = resolveBundledPluginPublicSurfacePath({
    rootDir: OPENCLAW_PACKAGE_ROOT,
    ...(bundledPluginsDir ? { bundledPluginsDir, bundledPluginsDirMode: "explicit" as const } : {}),
    dirName: params.dirName,
    artifactBasename: params.artifactBasename,
  });
  if (!modulePath) {
    return null;
  }
  return {
    modulePath,
    boundaryRoot:
      bundledPluginsDir && modulePath.startsWith(path.resolve(bundledPluginsDir) + path.sep)
        ? path.resolve(bundledPluginsDir)
        : OPENCLAW_PACKAGE_ROOT,
  };
}

function resolvePublicSurfaceLocation(params: {
  dirName: string;
  artifactBasename: string;
}): { modulePath: string; boundaryRoot: string } | null {
  const key = createResolutionKey(params);
  const cached = publicSurfaceLocationCache.get(key);
  if (cached) {
    return cached;
  }
  const resolved = resolvePublicSurfaceLocationUncached(params);
  if (resolved) {
    publicSurfaceLocationCache.set(key, resolved);
  }
  return resolved;
}

export function resolveBundledPluginPublicArtifactPath(params: {
  dirName: string;
  artifactBasename: string;
}): string | null {
  return resolvePublicSurfaceLocation(params)?.modulePath ?? null;
}

export function resetBundledPluginPublicArtifactLoaderForTest(): void {
  publicSurfaceModuleCache.clear();
  publicSurfaceLocationCache.clear();
  moduleLoaders.clear();
}
