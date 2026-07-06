// Helpers for deriving package names from persisted plugin and hook-pack install records.
import type { HookInstallRecord } from "../config/types.hooks.ts";
import type { PluginInstallRecord } from "../config/types.plugins.ts";
import { parseRegistryNpmSpec } from "../infra/npm-registry-spec.ts";

/** Return the installed npm package name for a plugin install record when available. */
export function extractInstalledNpmPackageName(install: PluginInstallRecord): string | undefined {
  if (install.source !== "npm") {
    return undefined;
  }
  const resolvedName = install.resolvedName?.trim();
  if (resolvedName) {
    return resolvedName;
  }
  return (
    (install.spec ? parseRegistryNpmSpec(install.spec)?.name : undefined) ??
    (install.resolvedSpec ? parseRegistryNpmSpec(install.resolvedSpec)?.name : undefined)
  );
}

/** Return the installed npm package name for a hook-pack install record when available. */
export function extractInstalledNpmHookPackageName(install: HookInstallRecord): string | undefined {
  const resolvedName = install.resolvedName?.trim();
  if (resolvedName) {
    return resolvedName;
  }
  return (
    (install.spec ? parseRegistryNpmSpec(install.spec)?.name : undefined) ??
    (install.resolvedSpec ? parseRegistryNpmSpec(install.resolvedSpec)?.name : undefined)
  );
}
