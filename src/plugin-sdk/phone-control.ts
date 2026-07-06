// Narrow plugin-sdk surface for the bundled phone-control plugin.
// Keep this list additive and scoped to the bundled phone-control surface.

export { definePluginEntry } from "./plugin-entry.ts";
export type {
  OpenClawPluginApi,
  OpenClawPluginCommandDefinition,
  OpenClawPluginService,
  PluginCommandContext,
} from "../plugins/types.ts";
