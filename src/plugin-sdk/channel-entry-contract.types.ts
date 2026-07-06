import type { PluginModuleLoaderFactory } from "../plugins/plugin-module-loader-cache.ts";

/** Test hook for swapping the source-module loader used by bundled entry imports. */
export type BundledEntryModuleLoadOptions = {
  createLoaderForTest?: PluginModuleLoaderFactory;
};
