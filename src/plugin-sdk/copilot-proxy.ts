// Narrow plugin-sdk surface for the bundled copilot-proxy plugin.
// Keep this list additive and scoped to the bundled Copilot proxy surface.

export { definePluginEntry } from "./plugin-entry.ts";
export type {
  OpenClawPluginApi,
  ProviderAuthContext,
  ProviderAuthResult,
} from "../plugins/types.ts";
