// Voice Call API module exposes the plugin public contract.
import type { OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";
import { normalizeAgentId } from "openclaw/plugin-sdk/routing";

/** Plugin state chunk row for one migrated call record event. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Return Voice Call agents whose templated core session stores need migration. */
export function resolveSessionStoreAgentIds(params: { cfg: OpenClawConfig }): string[] {
  const agentIds = new Set<string>();
  for (const pluginId of ["voice-call", "@openclaw/voice-call"]) {
    const entry = params.cfg.plugins?.entries?.[pluginId];
    if (!entry) {
      continue;
    }
    const config = entry.config === undefined ? {} : asRecord(entry.config);
    if (!config) {
      continue;
    }
    agentIds.add(normalizeAgentId(typeof config.agentId === "string" ? config.agentId : undefined));
    const numbers = asRecord(config.numbers);
    for (const route of Object.values(numbers ?? {})) {
      const agentId = asRecord(route)?.agentId;
      if (typeof agentId === "string") {
        agentIds.add(normalizeAgentId(agentId));
      }
    }
  }
  return [...agentIds].toSorted();
}
