// Channel route target helpers — collects all possible routes for each agent
import { isRecord as hasRecord } from "@openclaw/normalization-core/record-coerce";
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { normalizeChatChannelId } from "../channels/ids.ts";
import { listRouteBindings } from "../config/bindings.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { resolveAgentRoute } from "./resolve-route.ts";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId, normalizeAgentId } from "./session-key.ts";

export type ChannelRouteTarget = {
  agentId: string;
  channels: string[];
};

function normalizeConfiguredChannelKey(raw?: string | null): string {
  return normalizeChatChannelId(raw) ?? normalizeLowercaseStringOrEmpty(raw);
}

function normalizeBindingChannelKey(raw?: string | null): string {
  return normalizeLowercaseStringOrEmpty(raw);
}

function addTarget(byAgent: Map<string, Set<string>>, agentId: string, channel: string): void {
  const normalizedAgent = normalizeAgentId(agentId);
  const normalizedChannel = channel.trim();
  if (!normalizedAgent || !normalizedChannel) return;
  
  const channels = byAgent.get(normalizedAgent) ?? new Set<string>();
  channels.add(normalizedChannel);
  byAgent.set(normalizedAgent, channels);
}

function isMetaKey(key: string): boolean {
  return key === "defaults" || key === "modelByChannel";
}

function isEnabled(value: unknown): boolean {
  return !(hasRecord(value) && value.enabled === false);
}

function getAccountIds(channelConfig: unknown): string[] {
  if (!hasRecord(channelConfig)) return [];
  const accounts = channelConfig.accounts;
  if (!hasRecord(accounts)) return [];
  
  return Object.entries(accounts)
    .filter(([, config]) => isEnabled(config))
    .map(([id]) => normalizeAccountId(id))
    .filter(Boolean);
}

export function collectChannelRouteTargets(cfg: OpenClawConfig): ChannelRouteTarget[] {
  const byAgent = new Map<string, Set<string>>();
  const channels = cfg.channels ?? {};
  for (const [channelId, channelConfig] of Object.entries(channels)) {
    if (isMetaKey(channelId)) continue;
    if (!isEnabled(channelConfig)) continue;

    const normalizedChannel = normalizeConfiguredChannelKey(channelId);
    if (!normalizedChannel) continue;

    const accountIds = getAccountIds(channelConfig);
    const sampledIds = accountIds.length > 0 ? accountIds : [DEFAULT_ACCOUNT_ID];

    for (const accountId of sampledIds) {
      const route = resolveAgentRoute({ cfg, channel: normalizedChannel, accountId });
      addTarget(byAgent, route.agentId, normalizedChannel);
    }
  }
  for (const binding of listRouteBindings(cfg)) {
    const channel = normalizeBindingChannelKey(binding.match?.channel);
    if (channel) {
      addTarget(byAgent, binding.agentId, channel);
    }
  }
  return Array.from(byAgent.entries())
    .map(([agentId, channels]) => ({
      agentId,
      channels: Array.from(channels).toSorted(),
    }))
    .filter((target) => target.channels.length > 0)
    .toSorted((a, b) => a.agentId.localeCompare(b.agentId));
}