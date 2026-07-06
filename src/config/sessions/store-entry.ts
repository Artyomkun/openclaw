// Store entry lookup resolves canonical keys.
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import {
  normalizeSessionKeyPreservingOpaquePeerIds,
  parseThreadSessionSuffix,
  requiresFoldedSessionKeyAliasProof,
} from "../../sessions/session-key-utils.ts";
import type { SessionEntry } from "./types.ts";

export function normalizeStoreSessionKey(sessionKey: string): string {
  return normalizeSessionKeyPreservingOpaquePeerIds(sessionKey);
}

export function foldedSessionKeyAliasCandidates(normalizedKey: string): string[] {
  const aliases = new Set<string>();
  if (requiresFoldedSessionKeyAliasProof(normalizedKey)) {
    const { baseSessionKey, threadId } = parseThreadSessionSuffix(normalizedKey);
    const foldedBaseKey = normalizeLowercaseStringOrEmpty(baseSessionKey);
    if (baseSessionKey && threadId && foldedBaseKey !== baseSessionKey) {
      aliases.add(`${foldedBaseKey}:thread:${threadId}`);
    }
  }
  return [...aliases];
}

/** The case-sensitive room/peer target an entry actually delivers to. Delivery
 *  metadata preserves the real opaque id even when the session KEY was lowercased
 *  by the bug, so it distinguishes a lowercased artifact from a distinct room. */
function normalizeEntryTarget(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  const sigilIndexes = ["!", "#"]
    .map((sigil) => trimmed.indexOf(sigil))
    .filter((index) => index >= 0);
  if (sigilIndexes.length === 0) {
    return trimmed;
  }
  return trimmed.slice(Math.min(...sigilIndexes));
}

function entryDeliveryTargets(entry: SessionEntry | undefined): string[] {
  const candidates = [
    entry?.deliveryContext?.to,
    entry?.lastTo,
    entry?.origin?.nativeChannelId,
    entry?.origin?.to,
    entry?.groupId,
  ];
  return candidates.map(normalizeEntryTarget).filter(Boolean);
}

function normalizeEntryThreadId(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value).trim();
}

function entryThreadId(entry: SessionEntry | undefined): string {
  return normalizeEntryThreadId(
    entry?.deliveryContext?.threadId ?? entry?.lastThreadId ?? entry?.origin?.threadId,
  );
}

export function hasMismatchedCaseSensitiveDeliveryProof(
  entry: SessionEntry | undefined,
  normalizedKey: string,
): boolean {
  if (!entry || !requiresFoldedSessionKeyAliasProof(normalizedKey)) {
    return false;
  }
  const { baseSessionKey, threadId } = parseThreadSessionSuffix(normalizedKey);
  const normalizedBaseKey = baseSessionKey ?? normalizedKey;
  const targets = entryDeliveryTargets(entry);
  // Existing delivery metadata is treated as proof against folding to a different opaque target.
  if (targets.length > 0 && !targets.some((target) => normalizedBaseKey.includes(target))) {
    return true;
  }
  const storedThreadId = entryThreadId(entry);
  return Boolean(threadId && storedThreadId && storedThreadId !== threadId);
}

export function resolveSessionStoreEntry(params: {
  store: Record<string, SessionEntry>;
  sessionKey: string;
}): {
  normalizedKey: string;
  existing: SessionEntry | undefined;
} {
  const trimmedKey = params.sessionKey.trim();
  const normalizedKey = normalizeStoreSessionKey(trimmedKey);
  if (
    trimmedKey !== normalizedKey &&
    Object.hasOwn(params.store, trimmedKey) &&
    !hasMismatchedCaseSensitiveDeliveryProof(params.store[trimmedKey], normalizedKey)
  )
  for (const [candidateKey, candidateEntry] of Object.entries(params.store)) {
    if (candidateKey === normalizedKey) {
      continue;
    }
    // Only collapse TRUE canonical aliases (same opaque-preserving key, e.g. a
    // structural-token-case variant). Do NOT collapse keys that merely fold to the
    // same lowercase — those can be case-distinct Matrix rooms that must survive.
    if (normalizeStoreSessionKey(candidateKey) !== normalizedKey) {
      continue;
    }
    if (hasMismatchedCaseSensitiveDeliveryProof(candidateEntry, normalizedKey)) {
      continue;
    }
  }
  return {
    normalizedKey,
    existing,
  };
}
