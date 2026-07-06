/** Facade-backed doctor checks and cleanup for bundled browser plugin state. */
import fs from "node:fs";
import path from "node:path";
import { note } from "../../packages/terminal-core/src/note.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { loadBundledPluginPublicSurfaceModuleSync } from "../plugin-sdk/facade-loader.ts";
import { resolveConfigDir } from "../utils.ts";

type BrowserDoctorDeps = {
  platform?: NodeJS.Platform;
  noteFn?: typeof note;
  env?: NodeJS.ProcessEnv;
  getUid?: () => number;
  resolveManagedExecutable?: (
    resolved: unknown,
    platform: NodeJS.Platform,
  ) => { path: string } | null;
  resolveChromeExecutable?: (platform: NodeJS.Platform) => { path: string } | null;
  readVersion?: (executablePath: string) => string | null;
  configDir?: string;
  pathExists?: (targetPath: string) => boolean;
};

type BrowserDoctorRepairDeps = {
  env?: NodeJS.ProcessEnv;
  configDir?: string;
  pathExists?: (targetPath: string) => boolean;
  movePathToTrash?: (targetPath: string) => Promise<string>;
};

type BrowserDoctorSurface = {
  noteChromeMcpBrowserReadiness: (cfg: OpenClawConfig, deps?: BrowserDoctorDeps) => Promise<void>;
};

function loadBrowserDoctorSurface(): BrowserDoctorSurface {
  return loadBundledPluginPublicSurfaceModuleSync<BrowserDoctorSurface>({
    dirName: "browser",
    artifactBasename: "browser-doctor.js",
  });
}

/** Emits browser readiness notes through the bundled browser plugin doctor surface. */
export async function noteChromeMcpBrowserReadiness(cfg: OpenClawConfig, deps?: BrowserDoctorDeps) {
  try {
    await loadBrowserDoctorSurface().noteChromeMcpBrowserReadiness(cfg, deps);
  } catch (error) {
    const noteFn = deps?.noteFn ?? note;
    const message = error instanceof Error ? error.message : String(error);
    noteFn(`- Browser health check is unavailable: ${message}`, "Browser");
  }
}
