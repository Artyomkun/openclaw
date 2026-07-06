// Hook loader — simplified
import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { createSubsystemLogger } from "../logging/subsystem.ts";
import { resolveGlobalSingleton } from "../shared/global-singleton.ts";
import { shouldIncludeHook } from "./config.ts";
import { hasConfiguredInternalHooks, resolveConfiguredInternalHookNames } from "./configured.ts";
import type { InternalHookHandler } from "./internal-hooks.ts";
import { registerInternalHook, unregisterInternalHook } from "./internal-hooks.ts";
import { loadWorkspaceHookEntries } from "./workspace.ts";

const log = createSubsystemLogger("hooks:loader");
const LOADED_INTERNAL_HOOK_REGISTRATIONS_KEY = Symbol.for("openclaw.loadedInternalHookRegistrations");
const loadedHookRegistrations = resolveGlobalSingleton<
  Array<{ event: string; handler: InternalHookHandler }>
>(LOADED_INTERNAL_HOOK_REGISTRATIONS_KEY, () => []);

function resetLoadedInternalHooks(): void {
  for (const reg of loadedHookRegistrations) {
    unregisterInternalHook(reg.event, reg.handler);
  }
  loadedHookRegistrations.length = 0;
}

export async function loadInternalHooks(
  cfg: OpenClawConfig,
  workspaceDir: string,
  opts?: { managedHooksDir?: string; bundledHooksDir?: string }
): Promise<number> {
  resetLoadedInternalHooks();

  if (!hasConfiguredInternalHooks(cfg)) {
    return 0;
  }

  const configuredNames = resolveConfiguredInternalHookNames(cfg);
  const entries = loadWorkspaceHookEntries(workspaceDir, {
    config: cfg,
    managedHooksDir: opts?.managedHooksDir,
    bundledHooksDir: opts?.bundledHooksDir,
  });

  let loadedCount = 0;

  for (const entry of entries) {
    // Skip if not configured or not enabled
    if (configuredNames && !configuredNames.has(entry.hook.name)) {
      continue;
    }
    if (!shouldIncludeHook({ entry, config: cfg })) {
      continue;
    }

    try {
      // Load handler
      const handlerPath = path.join(entry.hook.baseDir, entry.hook.entry);
      if (!fs.existsSync(handlerPath)) {
        log.warn(`Hook handler not found: ${handlerPath}`);
        continue;
      }

      const mod = await import(handlerPath);
      const exportName = entry.metadata?.export ?? "default";
      const handler = mod[exportName] ?? mod.default;

      if (typeof handler !== "function") {
        log.warn(`Handler ${exportName} is not a function`);
        continue;
      }

      const events = entry.metadata?.events ?? [];
      if (events.length === 0) {
        log.warn(`No events defined for hook: ${entry.hook.name}`);
        continue;
      }

      for (const event of events) {
        registerInternalHook(event, handler);
        loadedHookRegistrations.push({ event, handler });
      }

      loadedCount++;
      log.debug(`Loaded hook: ${entry.hook.name} (${events.join(", ")})`);
    } catch (err) {
      log.error(`Failed to load hook ${entry.hook.name}: ${err}`);
    }
  }

  return loadedCount;
}