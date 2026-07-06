/**
 * Runtime seams used by subagent registry code for plugin/context-engine initialization.
 */
export { ensureContextEnginesInitialized } from "../context-engine/init.ts";
export { resolveContextEngine } from "../context-engine/registry.ts";
export { ensureRuntimePluginsLoaded } from "./runtime-plugins.ts";
