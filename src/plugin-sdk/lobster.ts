// Private Lobster plugin helpers for bundled extensions.
// Keep this surface narrow and limited to the Lobster workflow/tool contract.

export { definePluginEntry } from "./plugin-entry.ts";
export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "./windows-spawn.ts";
export type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolContext,
  OpenClawPluginToolFactory,
} from "../plugins/types.ts";
