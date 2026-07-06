// Gateway session listing — simplified
import fs from "node:fs";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { parseAgentSessionKey } from "../routing/session-key.ts";

export type GatewaySessionRow = {
  key: string;
  sessionId?: string;
  displayName?: string;
  modelProvider?: string;
  model?: string;
  status?: string;
  updatedAt?: number;
  createdAt?: number;
  startedAt?: number;
  endedAt?: number;
  channel?: string;
  subject?: string;
  label?: string;
  childSessions?: string[];
};

export type SessionsListResult = {
  sessions: GatewaySessionRow[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
};

export function listSessions(
  cfg: OpenClawConfig,
  storePath: string,
  opts?: { limit?: number; offset?: number; agentId?: string }
): SessionsListResult {
  const store = loadSessionStore(storePath);
  const entries = Object.entries(store)
    .filter(([key]) => !isCronRunSessionKey(key))
    .filter(([key]) => !isPhantomEntry(key))
    .filter(([key, entry]) => {
      if (opts?.agentId) {
        const parsed = parseAgentSessionKey(key);
        if (!parsed) return false;
        return parsed.agentId === opts.agentId;
      }
      return true;
    })
    .sort((a, b) => (b[1]?.updatedAt ?? 0) - (a[1]?.updatedAt ?? 0));

  const totalCount = entries.length;
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 100;
  const paginated = entries.slice(offset, offset + limit);

  const sessions = paginated.map(([key, entry]) => ({
    key,
    sessionId: entry.sessionId,
    displayName: entry.displayName ?? entry.label ?? key,
    modelProvider: entry.modelProvider,
    model: entry.model,
    status: entry.status,
    updatedAt: entry.updatedAt,
    createdAt: entry.createdAt,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    channel: entry.channel,
    subject: entry.subject,
    label: entry.label,
    childSessions: resolveChildSessions(store, key),
  }));

  return {
    sessions,
    totalCount,
    hasMore: offset + limit < totalCount,
    nextOffset: offset + limit < totalCount ? offset + limit : undefined,
  };
}

function loadSessionStore(storePath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf-8"));
  } catch {
    return {};
  }
}

function isCronRunSessionKey(key: string): boolean {
  return key.includes(":cron:");
}

function isPhantomEntry(key: string): boolean {
  const parsed = parseAgentSessionKey(key);
  return parsed?.rest === "sessions";
}

function resolveChildSessions(store: Record<string, any>, parentKey: string): string[] {
  const children: string[] = [];
  for (const [key, entry] of Object.entries(store)) {
    if (entry.spawnedBy === parentKey || entry.parentSessionKey === parentKey) {
      children.push(key);
    }
  }
  return children;
}