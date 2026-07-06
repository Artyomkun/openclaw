// Runtime bridge for plugin-provided text transforms.
import { mergePluginTextTransforms } from "../agents/plugin-text-transforms.ts";
import { getActiveRuntimePluginRegistry } from "./active-runtime-registry.ts";
import type { PluginTextTransforms } from "./types.ts";

/** Resolves merged text transforms from the active runtime plugin registry. */
export function resolveRuntimeTextTransforms(): PluginTextTransforms | undefined {
  const registry = getActiveRuntimePluginRegistry();
  const pluginTextTransforms = Array.isArray(registry?.textTransforms)
    ? registry.textTransforms.map((entry) => entry.transforms)
    : [];
  return mergePluginTextTransforms(...pluginTextTransforms);
}
