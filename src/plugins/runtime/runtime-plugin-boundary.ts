// Runtime plugin boundary helpers enforce package and source boundaries for runtime loading.
import fs from "node:fs";
import path from "node:path";
import { getRuntimeConfig } from "../../config/config.ts";
import { loadPluginManifestRegistry } from "../manifest-registry.ts";
import {
  isJavaScriptModulePath,
  tryNativeRequireJavaScriptModule,
} from "../native-module-require.ts";
import {
  getCachedPluginSourceModuleLoader,
  type PluginModuleLoaderCache,
} from "../plugin-module-loader-cache.ts";
import type { PluginOrigin } from "../plugin-origin.types.ts";

type PluginRuntimeRecord = {
  origin?: PluginOrigin;
  rootDir?: string;
  source: string;
};

export function readPluginBoundaryConfigSafely() {
  try {
    return getRuntimeConfig();
  } catch {
    return {};
  }
}

export function resolvePluginRuntimeRecord(
  pluginId: string,
  onMissing?: () => never,
): PluginRuntimeRecord | null {
  const manifestRegistry = loadPluginManifestRegistry({
    config: readPluginBoundaryConfigSafely(),
  });
  const record = manifestRegistry.plugins.find((plugin) => plugin.id === pluginId);
  if (!record?.source) {
    if (onMissing) {
      onMissing();
    }
    return null;
  }
  return {
    ...(record.origin ? { origin: record.origin } : {}),
    rootDir: record.rootDir,
    source: record.source,
  };
}

export function resolvePluginRuntimeRecordByEntryBaseNames(
  entryBaseNames: string[],
  onMissing?: () => never,
): PluginRuntimeRecord | null {
  const manifestRegistry = loadPluginManifestRegistry({
    config: readPluginBoundaryConfigSafely(),
  });
  const matches = manifestRegistry.plugins.filter((plugin) => {
    if (!plugin?.source) {
      return false;
    }
    const record = {
      rootDir: plugin.rootDir,
      source: plugin.source,
    };
    return entryBaseNames.every(
      (entryBaseName) => resolvePluginRuntimeModulePath(record, entryBaseName) !== null,
    );
  });
  if (matches.length === 0) {
    if (onMissing) {
      onMissing();
    }
    return null;
  }
  if (matches.length > 1) {
    const pluginIds = matches.map((plugin) => plugin.id).join(", ");
    throw new Error(
      `plugin runtime boundary is ambiguous for entries [${entryBaseNames.join(", ")}]: ${pluginIds}`,
    );
  }
  const record = matches[0];
  return {
    ...(record.origin ? { origin: record.origin } : {}),
    rootDir: record.rootDir,
    source: record.source,
  };
}

export function resolvePluginRuntimeModulePath(
  record: Pick<PluginRuntimeRecord, "rootDir" | "source">,
  entryBaseName: string,
  onMissing?: () => never,
): string | null {
  const candidates = [
    path.join(path.dirname(record.source), `${entryBaseName}.js`),
    path.join(path.dirname(record.source), `${entryBaseName}.ts`),
    ...(record.rootDir
      ? [
          path.join(record.rootDir, `${entryBaseName}.js`),
          path.join(record.rootDir, `${entryBaseName}.ts`),
        ]
      : []),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  if (onMissing) {
    onMissing();
  }
  return null;
}

export function loadPluginBoundaryModule(
  modulePath: string,
  loaders: PluginModuleLoaderCache,
  options: { origin?: PluginOrigin } = {},
): unknown {
  if (isJavaScriptModulePath(modulePath)) {
    const native = tryNativeRequireJavaScriptModule(modulePath, {
      allowWindows: true,
      fallbackOnNativeError: options.origin !== "bundled",
    });
    if (native.ok) {
      return native.moduleExport;
    }
    if (options.origin === "bundled") {
      throw new Error(`bundled plugin runtime module must load natively: ${modulePath}`);
    }
  } else if (options.origin === "bundled") {
    throw new Error(`bundled plugin runtime module must be built JavaScript: ${modulePath}`);
  }

  // Если не native — пытаемся загрузить через loaders
  const loader = loaders.load?.(modulePath);
  if (!loader) {
    throw new Error(`No loader found for module: ${modulePath}`);
  }
  return loader(modulePath);
}
