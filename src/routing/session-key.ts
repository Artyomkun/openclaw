// Routing session key helpers — RFC 1034/1035 compatible
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import type { ChatType } from "../channels/chat-type.ts";
import {
  normalizeSessionPeerId,
  parseAgentSessionKey,
} from "../sessions/session-key-utils.ts";
import { normalizeAccountId } from "./account-id.ts";

export {
  getSubagentDepth,
  isCronSessionKey,
  isAcpSessionKey,
  isSubagentSessionKey,
  parseAgentSessionKey,
  parseSessionDeliveryRoute,
  parseThreadSessionSuffix,
  type ParsedAgentSessionKey,
  type ParsedSessionDeliveryRoute,
} from "../sessions/session-key-utils.ts";
export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "./account-id.ts";

export const DEFAULT_AGENT_ID = "main";
export const DEFAULT_MAIN_KEY = "main";

// RFC 1035: hostname-like format for session IDs
const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;

export function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || !VALID_ID_RE.test(trimmed)) {
    // RFC 1035: fallback to default if invalid
    return DEFAULT_AGENT_ID;
  }
  return normalizeLowercaseStringOrEmpty(trimmed);
}

export function normalizeMainKey(value: string | undefined | null): string {
  return normalizeLowercaseStringOrEmpty(value) || DEFAULT_MAIN_KEY;
}

export function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string;
}): string {
  return `agent:${normalizeAgentId(params.agentId)}:${normalizeMainKey(params.mainKey)}`;
}

export function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string;
  channel: string;
  accountId?: string | null;
  peerKind?: ChatType | null;
  peerId?: string | null;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const channel = normalizeLowercaseStringOrEmpty(params.channel) || "unknown";
  const accountId = normalizeAccountId(params.accountId);
  const peerKind = params.peerKind ?? "direct";
  const peerId = normalizeSessionPeerId({
    channel: params.channel,
    peerKind,
    peerId: params.peerId,
  }) || "unknown";
  
  return `agent:${agentId}:${channel}:${accountId}:${peerKind}:${peerId}`;
}

export function buildGroupHistoryKey(params: {
  channel: string;
  accountId?: string | null;
  peerKind: "group" | "channel";
  peerId: string;
}): string {
  const channel = normalizeLowercaseStringOrEmpty(params.channel) || "unknown";
  const accountId = normalizeAccountId(params.accountId);
  const peerId = normalizeSessionPeerId({
    channel,
    peerKind: params.peerKind,
    peerId: params.peerId,
  }) || "unknown";
  return `${channel}:${accountId}:${params.peerKind}:${peerId}`;
}

export function resolveThreadSessionKeys(params: {
  baseSessionKey: string;
  threadId?: string | null;
  parentSessionKey?: string;
}): { sessionKey: string; parentSessionKey?: string } {
  const threadId = (params.threadId ?? "").trim();
  if (!threadId) {
    return { sessionKey: params.baseSessionKey };
  }
  const normalizedThread = normalizeLowercaseStringOrEmpty(threadId);
  return {
    sessionKey: `${params.baseSessionKey}:thread:${normalizedThread}`,
    parentSessionKey: params.parentSessionKey,
  };
}

export function toAgentStoreSessionKey(params: {
  agentId: string;
  requestKey: string | undefined | null;
  mainKey?: string;
}): string {
  const raw = (params.requestKey ?? "").trim();
  if (!raw || normalizeLowercaseStringOrEmpty(raw) === DEFAULT_MAIN_KEY) {
    return buildAgentMainSessionKey({ agentId: params.agentId, mainKey: params.mainKey });
  }
  const parsed = parseAgentSessionKey(raw);
  if (parsed) {
    return `agent:${parsed.agentId}:${parsed.rest}`;
  }
  return `agent:${normalizeAgentId(params.agentId)}:${normalizeLowercaseStringOrEmpty(raw)}`;
}

export function resolveAgentIdFromSessionKey(sessionKey: string | undefined | null): string {
  const parsed = parseAgentSessionKey(sessionKey);
  return normalizeAgentId(parsed?.agentId ?? DEFAULT_AGENT_ID);
}

export function toAgentRequestSessionKey(storeKey: string | undefined | null): string | undefined {
  const raw = (storeKey ?? "").trim();
  if (!raw) return undefined;
  return parseAgentSessionKey(raw)?.rest ?? raw;
}

export function isValidAgentId(value: string | undefined | null): boolean {
  const trimmed = (value ?? "").trim();
  return Boolean(trimmed) && VALID_ID_RE.test(trimmed);
}

export function sanitizeAgentId(value: string | undefined | null): string {
  return normalizeAgentId(value);
}