// Session entry reset freshness resolves the same lifecycle rule used by reply setup.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.ts";
import type { SessionConfig, SessionResetConfig } from "../types.base.ts";
import { getCliSessionBinding } from "./cli-session-binding.ts";
import { resolveSessionLifecycleTimestamps } from "./lifecycle.ts";
import { resolveStorePath as resolveSessionStorePath } from "./paths.ts";
import {
  evaluateSessionFreshness,
  resolveSessionResetPolicy,
  type SessionFreshness,
  type SessionResetPolicy,
  type SessionResetType,
} from "./reset.ts";
import { loadSessionEntry, type SessionAccessScope } from "./session-accessor.ts";
import type { SessionEntry } from "./types.ts";

export type ResolveSessionEntryResetFreshnessParams = SessionAccessScope & {
  now?: number;
  resetOverride?: SessionResetConfig;
  resetType: SessionResetType;
  sessionCfg?: SessionConfig;
};

export type SessionEntryLifecycleTimestamps = {
  sessionStartedAt?: number;
  lastInteractionAt?: number;
};

export type ResolvedSessionEntryResetFreshness =
  | {
      state: "missing";
      entry: undefined;
      freshness: undefined;
      lifecycleTimestamps: SessionEntryLifecycleTimestamps;
      resetPolicy: SessionResetPolicy;
      resetType: SessionResetType;
    }
  | {
      state: "fresh" | "stale";
      entry: SessionEntry;
      freshness: SessionFreshness;
      lifecycleTimestamps: SessionEntryLifecycleTimestamps;
      resetPolicy: SessionResetPolicy;
      resetType: SessionResetType;
    };

function hasProviderOwnedSession(entry: SessionEntry | undefined): boolean {
  const provider = normalizeOptionalString(entry?.providerOverride ?? entry?.modelProvider);
  return Boolean(provider && getCliSessionBinding(entry, provider));
}

/** Resolves one session entry's reset freshness using the runtime lifecycle rules. */
export function resolveSessionEntryResetFreshness(
  params: ResolveSessionEntryResetFreshnessParams,
): ResolvedSessionEntryResetFreshness {
  const agentId = params.agentId ?? resolveAgentIdFromSessionKey(params.sessionKey);
  const sessionCfg = params.sessionCfg;
  const storePath =
    params.storePath ??
    resolveSessionStorePath(sessionCfg?.store, {
      agentId,
      env: params.env,
    });
  const entry = loadSessionEntry({
    ...params,
    agentId,
    storePath,
  });
  const resetType = params.resetType;
  const resetPolicy = resolveSessionResetPolicy({
    sessionCfg,
    resetType,
    resetOverride: params.resetOverride,
  });
  const lifecycleTimestamps = resolveSessionLifecycleTimestamps({
    entry,
    agentId,
    storePath,
  });
  const base = {
    lifecycleTimestamps,
    resetPolicy,
    resetType,
  };
  if (!entry) {
    return {
      state: "missing",
      entry: undefined,
      freshness: undefined,
      ...base,
    };
  }
  const freshness =
    resetPolicy.configured !== true && hasProviderOwnedSession(entry)
      ? ({ fresh: true } satisfies SessionFreshness)
      : evaluateSessionFreshness({
          updatedAt: entry.updatedAt,
          sessionStartedAt: lifecycleTimestamps.sessionStartedAt,
          lastInteractionAt: lifecycleTimestamps.lastInteractionAt,
          now: params.now ?? Date.now(),
          policy: resetPolicy,
        });
  return {
    state: freshness.fresh ? "fresh" : "stale",
    entry,
    freshness,
    ...base,
  };
}
