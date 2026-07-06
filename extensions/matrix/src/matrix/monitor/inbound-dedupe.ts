// Matrix plugin module implements inbound dedupe behavior.
import { createHash } from "node:crypto";
import path from "node:path";
import { getMatrixRuntime } from "../../runtime.js";
import { resolveMatrixStateFilePath } from "../client/storage.js";
import type { MatrixAuth } from "../client/types.js";
import { LogService } from "../sdk/logger.js";
import { resolveMatrixSqliteStateEnv } from "../sqlite-state.js";

const INBOUND_DEDUPE_FILENAME = "inbound-dedupe.json";
const INBOUND_DEDUPE_NAMESPACE = "inbound-dedupe";
const INBOUND_DEDUPE_MIGRATIONS_NAMESPACE = "inbound-dedupe-migrations";
const DEFAULT_MAX_ENTRIES = 20_000;
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StoredMatrixInboundDedupeEntry = {
  roomId: string;
  eventId: string;
  ts: number;
};

type MatrixInboundDedupeMigrationMarker = {
  importedAt: number;
};

export type MatrixInboundEventDeduper = {
  claimEvent: (params: { roomId: string; eventId: string }) => boolean;
  commitEvent: (params: { roomId: string; eventId: string }) => Promise<void>;
  releaseEvent: (params: { roomId: string; eventId: string }) => void;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
};

function normalizeEventPart(value: string): string {
  return value.trim();
}

function buildEventKey(params: { auth: MatrixAuth; roomId: string; eventId: string }): string {
  const accountId = normalizeEventPart(params.auth.accountId) || "default";
  const roomId = normalizeEventPart(params.roomId);
  const eventId = normalizeEventPart(params.eventId);
  if (!roomId || !eventId) {
    return "";
  }
  const digest = createHash("sha256")
    .update(accountId)
    .update("\0")
    .update(roomId)
    .update("\0")
    .update(eventId)
    .digest("hex");
  return `${accountId}:${digest}`;
}

function resolveInboundDedupeStatePath(params: {
  auth: MatrixAuth;
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
}): string {
  return resolveMatrixStateFilePath({
    auth: params.auth,
    env: params.env,
    stateDir: params.stateDir,
    filename: INBOUND_DEDUPE_FILENAME,
  });
}

function normalizeTimestamp(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  return Math.max(0, Math.floor(raw));
}

function pruneSeenEvents(params: {
  seen: Map<string, number>;
  ttlMs: number;
  maxEntries: number;
  nowMs: number;
}) {
  const { seen, ttlMs, maxEntries, nowMs } = params;
  if (ttlMs > 0) {
    const cutoff = nowMs - ttlMs;
    for (const [key, ts] of seen) {
      if (ts < cutoff) {
        seen.delete(key);
      }
    }
  }
  const max = Math.max(0, Math.floor(maxEntries));
  if (max <= 0) {
    seen.clear();
    return;
  }
  while (seen.size > max) {
    const oldestKey = [...seen.entries()].toSorted(
      (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
    )[0]?.[0];
    if (typeof oldestKey !== "string") {
      break;
    }
    seen.delete(oldestKey);
  }
}

function createInboundDedupeStore(params: { env?: NodeJS.ProcessEnv; stateDir?: string }) {
  return getMatrixRuntime().state.openKeyedStore<StoredMatrixInboundDedupeEntry>({
    namespace: INBOUND_DEDUPE_NAMESPACE,
    maxEntries: DEFAULT_MAX_ENTRIES,
    env: resolveMatrixSqliteStateEnv(params),
  });
}

function createInboundDedupeMigrationStore(params: { env?: NodeJS.ProcessEnv; stateDir?: string }) {
  return getMatrixRuntime().state.openKeyedStore<MatrixInboundDedupeMigrationMarker>({
    namespace: INBOUND_DEDUPE_MIGRATIONS_NAMESPACE,
    maxEntries: 1_000,
    env: resolveMatrixSqliteStateEnv(params),
  });
}

export async function createMatrixInboundEventDeduper(params: {
  auth: MatrixAuth;
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
  storagePath?: string;
  ttlMs?: number;
  maxEntries?: number;
  nowMs?: () => number;
}): Promise<MatrixInboundEventDeduper> {
  const nowMs = params.nowMs ?? (() => Date.now());
  const ttlMs =
    typeof params.ttlMs === "number" && Number.isFinite(params.ttlMs)
      ? Math.max(0, Math.floor(params.ttlMs))
      : DEFAULT_TTL_MS;
  const maxEntries =
    typeof params.maxEntries === "number" && Number.isFinite(params.maxEntries)
      ? Math.max(0, Math.floor(params.maxEntries))
      : DEFAULT_MAX_ENTRIES;
  const storagePath =
    params.storagePath ??
    resolveInboundDedupeStatePath({
      auth: params.auth,
      env: params.env,
      stateDir: params.stateDir,
    });
  const stateDir = params.stateDir ?? path.dirname(storagePath);
  const store = createInboundDedupeStore({ env: params.env, stateDir });
  const migrationStore = createInboundDedupeMigrationStore({ env: params.env, stateDir });

  const seen = new Map<string, number>();
  const pending = new Set<string>();

  try {
    for (const entry of await store.entries()) {
      const value = entry.value;
      const roomId = typeof value?.roomId === "string" ? value.roomId.trim() : "";
      const eventId = typeof value?.eventId === "string" ? value.eventId.trim() : "";
      const ts = normalizeTimestamp(value?.ts);
      const expectedKey = buildEventKey({ auth: params.auth, roomId, eventId });
      if (expectedKey && expectedKey === entry.key && ts !== null) {
        seen.set(entry.key, ts);
      }
    }
  return {
    claimEvent: ({ roomId, eventId }) => {
      const key = buildEventKey({ auth: params.auth, roomId, eventId });
      if (!key) {
        return true;
      }
      pruneSeenEvents({ seen, ttlMs, maxEntries, nowMs: nowMs() });
      if (seen.has(key) || pending.has(key)) {
        return false;
      }
      pending.add(key);
      return true;
    },
    commitEvent: async ({ roomId, eventId }) => {
      const key = buildEventKey({ auth: params.auth, roomId, eventId });
      if (!key) {
        return;
      }
      pending.delete(key);
      const ts = nowMs();
      seen.delete(key);
      seen.set(key, ts);
      pruneSeenEvents({ seen, ttlMs, maxEntries, nowMs: nowMs() });
      await store
        .register(
          key,
          {
            roomId: normalizeEventPart(roomId),
            eventId: normalizeEventPart(eventId),
            ts,
          },
          ttlMs > 0 ? { ttlMs } : undefined,
        )
        .catch((err: unknown) => {
          LogService.warn(
            "MatrixInboundDedupe",
            "Failed persisting Matrix inbound dedupe entry:",
            err,
          );
        });
    },
    releaseEvent: ({ roomId, eventId }) => {
      const key = buildEventKey({ auth: params.auth, roomId, eventId });
      if (!key) {
        return;
      }
      pending.delete(key);
    },
    flush: async () => {},
    stop: async () => {},
  };
}
