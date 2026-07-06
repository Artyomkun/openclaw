// Route resolution helpers — simplified
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { resolveDefaultAgentId } from "../agents/agent-scope.ts";
import type { ChatType } from "../channels/chat-type.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { listBindings } from "./bindings.ts";
import {
  buildAgentMainSessionKey,
  buildAgentPeerSessionKey,
  DEFAULT_MAIN_KEY,
  normalizeAccountId,
  normalizeAgentId,
} from "./session-key.ts";

export type RoutePeer = {
  kind: ChatType;
  id: string;
};

export type ResolveAgentRouteInput = {
  cfg: OpenClawConfig;
  channel: string;
  accountId?: string | null;
  peer?: RoutePeer | null;
  parentPeer?: RoutePeer | null;
  guildId?: string | null;
  teamId?: string | null;
  memberRoleIds?: string[];
};

export type ResolvedAgentRoute = {
  agentId: string;
  channel: string;
  accountId: string;
  sessionKey: string;
  mainSessionKey: string;
  matchedBy:
    | "binding.peer"
    | "binding.parent"
    | "binding.guild"
    | "binding.team"
    | "binding.account"
    | "binding.channel"
    | "default";
};

function normalizeId(value: unknown): string {
  return normalizeLowercaseStringOrEmpty(String(value ?? ""));
}

function peerMatches(peer: RoutePeer | null, kind: string, id: string): boolean {
  if (!peer) return false;
  return peer.kind === kind && peer.id === id;
}

export function resolveAgentRoute(input: ResolveAgentRouteInput): ResolvedAgentRoute {
  const channel = normalizeLowercaseStringOrEmpty(input.channel) || "unknown";
  const accountId = normalizeAccountId(input.accountId);
  const peer = input.peer;
  const parentPeer = input.parentPeer;
  const guildId = normalizeId(input.guildId);
  const teamId = normalizeId(input.teamId);
  const roles = new Set(input.memberRoleIds ?? []);

  // Build session key
  const buildSession = (agentId: string): ResolvedAgentRoute => {
    const resolvedAgentId = normalizeAgentId(agentId);
    const sessionKey = buildAgentPeerSessionKey({
      agentId: resolvedAgentId,
      mainKey: DEFAULT_MAIN_KEY,
      channel,
      accountId,
      peerKind: peer?.kind ?? "direct",
      peerId: peer?.id ?? null,
    });
    const mainSessionKey = buildAgentMainSessionKey({
      agentId: resolvedAgentId,
      mainKey: DEFAULT_MAIN_KEY,
    });
    return {
      agentId: resolvedAgentId,
      channel,
      accountId,
      sessionKey,
      mainSessionKey,
      matchedBy: "default",
    };
  };

  // Find matching binding
  for (const binding of listBindings(input.cfg)) {
    const match = binding.match;
    if (!match) continue;
    
    const bindingChannel = normalizeLowercaseStringOrEmpty(match.channel);
    if (bindingChannel && bindingChannel !== channel) continue;

    // Check peer
    if (match.peer) {
      if (peer && peerMatches(peer, match.peer.kind, match.peer.id)) {
        return { ...buildSession(binding.agentId), matchedBy: "binding.peer" };
      }
      // Check parent peer (threads)
      if (parentPeer && peerMatches(parentPeer, match.peer.kind, match.peer.id)) {
        return { ...buildSession(binding.agentId), matchedBy: "binding.parent" };
      }
      // Wildcard
      if (match.peer.id === "*" && peer && peer.kind === match.peer.kind) {
        return { ...buildSession(binding.agentId), matchedBy: "binding.peer" };
      }
    }

    // Check guild
    if (match.guildId && guildId === normalizeId(match.guildId)) {
      // With roles
      if (match.roles?.length && roles.size > 0) {
        const hasRole = match.roles.some(r => roles.has(r));
        if (hasRole) {
          return { ...buildSession(binding.agentId), matchedBy: "binding.guild" };
        }
      }
      // Without roles
      if (!match.roles?.length) {
        return { ...buildSession(binding.agentId), matchedBy: "binding.guild" };
      }
    }

    // Check team (Slack)
    if (match.teamId && teamId === normalizeId(match.teamId)) {
      return { ...buildSession(binding.agentId), matchedBy: "binding.team" };
    }

    // Check account
    if (match.accountId && accountId === normalizeId(match.accountId)) {
      return { ...buildSession(binding.agentId), matchedBy: "binding.account" };
    }

    // Check channel (wildcard account)
    if (!match.accountId) {
      return { ...buildSession(binding.agentId), matchedBy: "binding.channel" };
    }
  }

  // Default
  return buildSession(resolveDefaultAgentId(input.cfg));
}