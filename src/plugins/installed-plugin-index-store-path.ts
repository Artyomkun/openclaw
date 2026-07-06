// Resolves filesystem paths for installed plugin index storage.
import path from "node:path";
import { resolveStateDir } from "../config/paths.ts";

// ============================================
// MAIN
// ============================================

export function resolveInstalledPluginIndexStorePath(options: { stateDir?: string; env?: NodeJS.ProcessEnv } = {}): string {
  if (options.stateDir) {
    return path.join(options.stateDir, "plugins", "index.db");
  }
  const stateDir = options.env?.OPENCLAW_STATE_DIR || resolveStateDir(options.env);
  return path.join(stateDir, "plugins", "index.db");
}