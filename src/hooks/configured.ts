// Configured hook helpers combine config and install records into active hooks.
import type { HookConfig } from "../config/types.hooks.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";

function hasEnabledFlag(entry: HookConfig | undefined): boolean {
  return entry?.enabled !== false;
}

/** Resolve explicitly configured internal hook names; null means all/discovered hooks may load. */
export function resolveConfiguredInternalHookNames(config: OpenClawConfig): Set<string> | null {
  const internal = config.hooks?.internal;
  if (!internal || internal.enabled === false) {
    return new Set();
  }
  if (internal.enabled === true) {
    return null;
  }

  const names = new Set<string>();
  for (const [name, entry] of Object.entries(internal.entries ?? {})) {
    const trimmed = name.trim();
    if (trimmed && hasEnabledFlag(entry)) {
      names.add(trimmed);
    }
  }
  for (const [installId, install] of Object.entries(internal.installs ?? {})) {
    const hookNames = install.hooks ?? [];
    if (hookNames.length === 0 && installId.trim()) {
      // An install without an explicit hook list can add hooks dynamically, so
      // callers must treat the allowlist as open-ended.
      return null;
    }
    for (const hookName of hookNames) {
      const trimmedHookName = hookName.trim();
      if (trimmedHookName) {
        names.add(trimmedHookName);
      }
    }
  }

  if ((internal.load?.extraDirs ?? []).some((dir) => dir.trim().length > 0)) {
    return null;
  }
  return names;
}
