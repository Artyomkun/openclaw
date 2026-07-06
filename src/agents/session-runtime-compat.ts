/**
 * Session runtime compatibility helpers.
 *
 * Resolves persisted runtime overrides without leaking provider-specific CLI runtime bindings across model routes.
 */
import type { SessionEntry } from "../config/sessions.ts";
import { isDefaultAgentRuntimeId } from "./agent-runtime-id.ts";
import { normalizeOptionalAgentRuntimeId } from "./agent-runtime-id.ts";

/** Persisted runtime fields used to recover session runtime compatibility. */
type SessionRuntimeCompatEntry = Pick<
  SessionEntry,
  "agentHarnessId" | "agentRuntimeOverride"
>;

/** Resolves the persisted runtime id, preferring explicit overrides. */
export function resolvePersistedSessionRuntimeId(
  entry?: SessionRuntimeCompatEntry,
): string | undefined {
  const runtimeOverride = normalizeOptionalAgentRuntimeId(entry?.agentRuntimeOverride);
  if (runtimeOverride && !isDefaultAgentRuntimeId(runtimeOverride)) {
    return runtimeOverride;
  }
  return normalizeOptionalAgentRuntimeId(entry?.agentHarnessId);
}
