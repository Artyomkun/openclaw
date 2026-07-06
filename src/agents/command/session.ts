/**
 * Resolves command session ids, keys, stores, and persisted thinking state.
 */
import crypto from "node:crypto";
import type { MsgContext } from "../../auto-reply/templating.ts";
import {
  normalizeThinkLevel,
  normalizeVerboseLevel,
  type ThinkLevel,
  type VerboseLevel,
} from "../../auto-reply/thinking.ts";
import {
  hasTerminalMainSessionTranscriptNewerThanRegistrySync,
  resolveSessionLifecycleTimestamps,
} from "../../config/sessions/lifecycle.ts";
import {
  resolveAgentIdFromSessionKey,
  resolveExplicitAgentSessionKey,
} from "../../config/sessions/main-session.ts";
import { resolveStorePath } from "../../config/sessions/paths.ts";
import {
  evaluateSessionFreshness,
  resolveSessionResetPolicy,
} from "../../config/sessions/reset-policy.ts";
import { resolveChannelResetConfig, resolveSessionResetType } from "../../config/sessions/reset.ts";
import { resolveSessionKey } from "../../config/sessions/session-key.ts";
import { loadSessionStore } from "../../config/sessions/store-load.ts";
import type { SessionEntry } from "../../config/sessions/types.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import {
  classifySessionKeyShape,
  isUnscopedSessionKeySentinel,
  normalizeAgentId,
  normalizeMainKey,
} from "../../routing/session-key.ts";
import { resolveSessionIdMatchSelection } from "../../sessions/session-id-resolution.ts";
import { listAgentIds, resolveDefaultAgentId } from "../agent-scope.ts";
import { clearBootstrapSnapshotOnSessionRollover } from "../bootstrap-cache.ts";

// ─── Types ─────────────────────────────────────────────────

interface SessionResolution {
  sessionId: string;
  sessionKey: string;
  sessionEntry: SessionEntry;
  sessionStore: Record<string, SessionEntry>;
  storePath: string;
  isNewSession: boolean;
  persistedThinking: ThinkLevel;
  persistedVerbose: VerboseLevel;
}

interface SessionKeyResolution {
  sessionKey: string;
  sessionStore: Record<string, SessionEntry>;
  storePath: string;
}

interface SessionIdMatchSet {
  matches: Array<[string, SessionEntry]>;
  primaryStoreMatches: Array<[string, SessionEntry]>;
  storeByKey: Map<string, SessionKeyResolution>;
}

// ─── Constants ─────────────────────────────────────────────

const EMPTY_SESSION_ENTRY: SessionEntry = {
  sessionId: "",
  updatedAt: 0,
};

const DEFAULT_THINK_LEVEL: ThinkLevel = "off";
const DEFAULT_VERBOSE_LEVEL: VerboseLevel = "off";

// ─── Helpers ───────────────────────────────────────────────

function clearRotatedTerminalMainSessionMetadata(entry: SessionEntry): SessionEntry {
  const {
    sessionFile,
    status,
    startedAt,
    endedAt,
    runtimeMs,
    abortedLastRun,
    sessionStartedAt,
    lastInteractionAt,
    ...rest
  } = entry;
  return rest as SessionEntry;
}

function requireSessionEntry(store: Record<string, SessionEntry>, key: string): SessionEntry {
  const entry = store[key];
  if (!entry) throw new Error(`Session entry not found for key: ${key}`);
  return entry;
}

// ─── Session Key Builder ───────────────────────────────────

export function buildExplicitSessionIdSessionKey(params: {
  sessionId: string;
  agentId: string;
}): string {
  return `agent:${normalizeAgentId(params.agentId)}:explicit:${params.sessionId.trim()}`;
}

// ─── Session ID Matching ───────────────────────────────────

function collectSessionIdMatchesForRequest(opts: {
  cfg: OpenClawConfig;
  sessionStore: Record<string, SessionEntry>;
  storePath: string;
  storeAgentId: string;
  sessionId: string;
  searchOtherAgentStores: boolean;
  clone: boolean;
}): SessionIdMatchSet {
  const matches: Array<[string, SessionEntry]> = [];
  const primaryStoreMatches: Array<[string, SessionEntry]> = [];
  const storeByKey = new Map<string, SessionKeyResolution>();

  const addMatches = (
    candidateStore: Record<string, SessionEntry>,
    candidateStorePath: string,
    isPrimary: boolean,
  ): void => {
    for (const [candidateKey, candidateEntry] of Object.entries(candidateStore)) {
      if (candidateEntry.sessionId !== opts.sessionId) continue;
      const entry: [string, SessionEntry] = [candidateKey, candidateEntry];
      matches.push(entry);
      if (isPrimary) primaryStoreMatches.push(entry);
      storeByKey.set(candidateKey, {
        sessionKey: candidateKey,
        sessionStore: candidateStore,
        storePath: candidateStorePath,
      });
    }
  };

  addMatches(opts.sessionStore, opts.storePath, true);

  if (!opts.searchOtherAgentStores) {
    return { matches, primaryStoreMatches, storeByKey };
  }

  for (const agentId of listAgentIds(opts.cfg)) {
    if (agentId === opts.storeAgentId) continue;
    const candidateStorePath = resolveStorePath(opts.cfg.session?.store ?? "", { agentId });
    const candidateStore = loadSessionStore(
      candidateStorePath,
      opts.clone ? { clone: true } : undefined,
    );
    addMatches(candidateStore, candidateStorePath, false);
  }

  return { matches, primaryStoreMatches, storeByKey };
}

// ─── Stored Session Key Lookup ─────────────────────────────

export function resolveStoredSessionKeyForSessionId(opts: {
  cfg: OpenClawConfig;
  sessionId: string;
  agentId: string;
}): SessionKeyResolution {
  const sessionId = opts.sessionId.trim();
  const storeAgentId = normalizeAgentId(opts.agentId);
  const storePath = resolveStorePath(opts.cfg.session?.store ?? "", { agentId: storeAgentId });
  const sessionStore = loadSessionStore(storePath);

  if (!sessionId) {
    return { sessionKey: "", sessionStore, storePath };
  }

  const selection = resolveSessionIdMatchSelection(
    Object.entries(sessionStore).filter(([, entry]) => entry.sessionId === sessionId),
    sessionId,
  );

  return {
    sessionKey: selection.kind === "selected" ? selection.sessionKey : "",
    sessionStore,
    storePath,
  };
}

// ─── Session Key Resolution ────────────────────────────────

export function resolveSessionKeyForRequest(opts: {
  cfg: OpenClawConfig;
  to: string;
  sessionId: string;
  sessionKey: string;
  agentId: string;
  clone: boolean;
}): SessionKeyResolution {
  const sessionCfg = opts.cfg.session ?? {};
  const scope = sessionCfg.scope ?? "per-sender";
  const mainKey = normalizeMainKey(sessionCfg.mainKey ?? "");
  const defaultAgentId = normalizeAgentId(resolveDefaultAgentId(opts.cfg));
  const requestedAgentId = opts.agentId ? normalizeAgentId(opts.agentId) : defaultAgentId;
  const requestedSessionId = opts.sessionId.trim();
  const requestedSessionKey = opts.sessionKey.trim();

  const toSessionKey =
    !requestedSessionKey && !requestedSessionId && classifySessionKeyShape(opts.to) === "agent"
      ? opts.to.trim()
      : "";

  const explicitSessionKey =
    requestedSessionKey ||
    toSessionKey ||
    (!requestedSessionId
      ? resolveExplicitAgentSessionKey({
          cfg: opts.cfg,
          agentId: requestedAgentId,
        })
      : "");

  const storeAgentId = explicitSessionKey
    ? isUnscopedSessionKeySentinel(explicitSessionKey)
      ? requestedAgentId
      : resolveAgentIdFromSessionKey(explicitSessionKey)
    : requestedAgentId;

  const storePath = resolveStorePath(sessionCfg.store ?? "", { agentId: storeAgentId });
  const sessionStore = loadSessionStore(
    storePath,
    opts.clone ? { clone: true } : undefined,
  );

  const ctx: MsgContext = { From: opts.to };
  let sessionKey =
    explicitSessionKey || resolveSessionKey(scope, ctx, mainKey, storeAgentId);

  if (
    requestedSessionId &&
    !explicitSessionKey &&
    (!sessionKey || sessionStore[sessionKey]?.sessionId !== requestedSessionId)
  ) {
    const { matches, primaryStoreMatches, storeByKey } = collectSessionIdMatchesForRequest({
      cfg: opts.cfg,
      sessionStore,
      storePath,
      storeAgentId,
      sessionId: requestedSessionId,
      searchOtherAgentStores: opts.agentId === "",
      clone: opts.clone,
    });

    const preferredSelection = resolveSessionIdMatchSelection(matches, requestedSessionId);
    const currentStoreSelection =
      preferredSelection.kind === "selected"
        ? preferredSelection
        : resolveSessionIdMatchSelection(primaryStoreMatches, requestedSessionId);

    if (currentStoreSelection.kind === "selected") {
      const preferred = storeByKey.get(currentStoreSelection.sessionKey);
      if (preferred) return preferred;
      sessionKey = currentStoreSelection.sessionKey;
    }
  }

  if (requestedSessionId && !sessionKey) {
    sessionKey = buildExplicitSessionIdSessionKey({
      sessionId: requestedSessionId,
      agentId: opts.agentId,
    });
  }

  return { sessionKey, sessionStore, storePath };
}

// ─── Session Resolution ────────────────────────────────────

export function resolveSession(opts: {
  cfg: OpenClawConfig;
  to: string;
  sessionId: string;
  sessionKey: string;
  agentId: string;
  clone: boolean;
}): SessionResolution {
  const sessionCfg = opts.cfg.session ?? {};
  const { sessionKey, sessionStore, storePath } = resolveSessionKeyForRequest({
    cfg: opts.cfg,
    to: opts.to,
    sessionId: opts.sessionId,
    sessionKey: opts.sessionKey,
    agentId: opts.agentId,
    clone: opts.clone,
  });

  if (!sessionKey) {
    return {
      sessionId: opts.sessionId || crypto.randomUUID(),
      sessionKey: "",
      sessionEntry: EMPTY_SESSION_ENTRY,
      sessionStore,
      storePath,
      isNewSession: true,
      persistedThinking: DEFAULT_THINK_LEVEL,
      persistedVerbose: DEFAULT_VERBOSE_LEVEL,
    };
  }

  const now = Date.now();
  const sessionEntry = requireSessionEntry(sessionStore, sessionKey);
  const sessionAgentId = opts.agentId
    ? normalizeAgentId(opts.agentId)
    : resolveAgentIdFromSessionKey(sessionKey);

  const resetType = resolveSessionResetType({ sessionKey });
  const channelReset = resolveChannelResetConfig({
    sessionCfg,
    channel: sessionEntry.lastChannel || sessionEntry.channel || sessionEntry.origin?.provider || "",
  });
  const resetPolicy = resolveSessionResetPolicy({
    sessionCfg,
    resetType,
    resetOverride: channelReset,
  });

  const requestedSessionId = opts.sessionId.trim();
  const terminalMainTranscriptNewerThanRegistry = !requestedSessionId
    ? hasTerminalMainSessionTranscriptNewerThanRegistrySync({
        entry: sessionEntry,
        sessionScope: sessionCfg.scope,
        sessionKey,
        agentId: sessionAgentId,
        mainKey: sessionCfg.mainKey ?? "",
        storePath,
      })
    : false;

  const fresh = !terminalMainTranscriptNewerThanRegistry &&
    evaluateSessionFreshness({
      updatedAt: sessionEntry.updatedAt,
      ...resolveSessionLifecycleTimestamps({
        entry: sessionEntry,
        agentId: sessionAgentId,
        storePath,
      }),
      now,
      policy: resetPolicy,
    }).fresh;

  const sessionId =
    requestedSessionId || (fresh ? sessionEntry.sessionId : "") || crypto.randomUUID();
  const isNewSession = !fresh && !requestedSessionId;
  const resolvedSessionEntry = terminalMainTranscriptNewerThanRegistry
    ? clearRotatedTerminalMainSessionMetadata(sessionEntry)
    : sessionEntry;

  clearBootstrapSnapshotOnSessionRollover({
    sessionKey,
    previousSessionId: isNewSession ? sessionEntry.sessionId : "",
  });

  return {
    sessionId,
    sessionKey,
    sessionEntry: resolvedSessionEntry,
    sessionStore,
    storePath,
    isNewSession,
    persistedThinking: fresh && sessionEntry.thinkingLevel
      ? (normalizeThinkLevel(sessionEntry.thinkingLevel) ?? DEFAULT_THINK_LEVEL)
      : DEFAULT_THINK_LEVEL,
    persistedVerbose: fresh && sessionEntry.verboseLevel
      ? (normalizeVerboseLevel(sessionEntry.verboseLevel) ?? DEFAULT_VERBOSE_LEVEL)
      : DEFAULT_VERBOSE_LEVEL,
  };
}