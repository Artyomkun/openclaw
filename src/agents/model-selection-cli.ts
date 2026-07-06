/**
 * Detects providers whose model selections are backed by CLI runtimes.
 */
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { resolveRuntimeCliBackends } from "../plugins/cli-backends.runtime.ts";
import { resolvePluginSetupCliBackendDescriptor } from "../plugins/setup-registry.runtime.ts";
import { normalizeProviderId } from "./model-selection-normalize.ts";

/** Return true when a provider id resolves to a configured or plugin CLI backend. */
export function isCliProvider(provider: string, cfg?: OpenClawConfig): boolean {
  const normalized = normalizeProviderId(provider);
  const backends = cfg?.agents?.defaults?.cliBackends ?? {};
  if (Object.keys(backends).some((key) => normalizeProviderId(key) === normalized)) {
    return true;
  }
  const cliBackends = resolveRuntimeCliBackends();
  if (cliBackends.some((backend) => normalizeProviderId(backend.id) === normalized)) {
    return true;
  }
  if (resolvePluginSetupCliBackendDescriptor({ backend: normalized, config: cfg })) {
    return true;
  }
  return false;
}
