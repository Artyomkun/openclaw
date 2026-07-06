// Discord plugin module implements doctor contract behavior.
import type {
  ChannelDoctorConfigMutation,
} from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  isSupportedRealtimeVoiceActivationName,
  normalizeRealtimeVoiceActivationNamePrefix,
} from "openclaw/plugin-sdk/realtime-voice";
import { asObjectRecord } from "openclaw/plugin-sdk/runtime-doctor";

type AgentBindingConfig = NonNullable<OpenClawConfig["bindings"]>[number];

function hasUnsupportedRealtimeWakeNamesInVoice(value: unknown): boolean {
  const voice = asObjectRecord(value);
  const realtime = asObjectRecord(voice?.realtime);
  const wakeNames = realtime?.wakeNames;
  return Array.isArray(wakeNames)
    ? wakeNames.length === 0 ||
        wakeNames.some(
          (wakeName) =>
            typeof wakeName === "string" && !isSupportedRealtimeVoiceActivationName(wakeName),
        )
    : false;
}

function hasUnsupportedDiscordRealtimeWakeNames(value: unknown): boolean {
  const entry = asObjectRecord(value);
  if (!entry) {
    return false;
  }
  return hasUnsupportedRealtimeWakeNamesInVoice(entry.voice);
}

function hasUnsupportedDiscordAccountRealtimeWakeNames(value: unknown): boolean {
  const accounts = asObjectRecord(value);
  if (!accounts) {
    return false;
  }
  return Object.values(accounts).some((account) => hasUnsupportedDiscordRealtimeWakeNames(account));
}

function normalizeUnsupportedRealtimeWakeNames(
  entry: Record<string, unknown>,
  pathPrefix: string,
  changes: string[],
): { entry: Record<string, unknown>; changed: boolean } {
  const voice = asObjectRecord(entry.voice);
  const realtime = asObjectRecord(voice?.realtime);
  const wakeNames = realtime?.wakeNames;
  if (!voice || !realtime || !Array.isArray(wakeNames)) {
    return { entry, changed: false };
  }

  if (wakeNames.length === 0) {
    const nextRealtime = { ...realtime };
    delete nextRealtime.wakeNames;
    changes.push(
      `Removed empty ${pathPrefix}.voice.realtime.wakeNames; unset wake names use the default agent/OpenClaw fallback.`,
    );
    return {
      entry: {
        ...entry,
        voice: {
          ...voice,
          realtime: nextRealtime,
        },
      },
      changed: true,
    };
  }

  let normalized = 0;
  let removed = 0;
  const nextWakeNames = wakeNames.flatMap((wakeName) => {
    if (typeof wakeName !== "string" || isSupportedRealtimeVoiceActivationName(wakeName)) {
      return [wakeName];
    }
    const nextWakeName = normalizeRealtimeVoiceActivationNamePrefix(wakeName);
    if (!nextWakeName) {
      removed += 1;
      return [];
    }
    normalized += 1;
    return [nextWakeName];
  });
  if (normalized === 0 && removed === 0) {
    return { entry, changed: false };
  }
  const dedupedWakeNames = Array.from(new Set(nextWakeNames));

  const nextRealtime = { ...realtime };
  if (dedupedWakeNames.length > 0) {
    nextRealtime.wakeNames = dedupedWakeNames;
  } else {
    delete nextRealtime.wakeNames;
  }
  if (normalized > 0) {
    changes.push(
      `Shortened ${normalized} unsupported ${pathPrefix}.voice.realtime.wakeNames entries to one or two words.`,
    );
  }
  if (removed > 0) {
    changes.push(
      `Removed ${removed} unsupported ${pathPrefix}.voice.realtime.wakeNames entries with no usable words.`,
    );
  }
  return {
    entry: {
      ...entry,
      voice: {
        ...voice,
        realtime: nextRealtime,
      },
    },
    changed: true,
  };
}

function normalizeDiscordGuildChannelAllowAliases(params: {
  entry: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
}): { entry: Record<string, unknown>; changed: boolean } {
  const guilds = asObjectRecord(params.entry.guilds);
  if (!guilds) {
    return { entry: params.entry, changed: false };
  }

  let changed = false;
  const nextGuilds = { ...guilds };
  for (const [guildId, guildValue] of Object.entries(guilds)) {
    const guild = asObjectRecord(guildValue);
    const channels = asObjectRecord(guild?.channels);
    if (!guild || !channels) {
      continue;
    }
    let channelsChanged = false;
    const nextChannels = { ...channels };
    for (const [channelId, channelValue] of Object.entries(channels)) {
      const channel = asObjectRecord(channelValue);
      if (!channel || !Object.hasOwn(channel, "allow")) {
        continue;
      }
      const nextChannel = { ...channel };
      if (nextChannel.enabled === undefined) {
        nextChannel.enabled = channel.allow;
        params.changes.push(
          `Moved ${params.pathPrefix}.guilds.${guildId}.channels.${channelId}.allow → ${params.pathPrefix}.guilds.${guildId}.channels.${channelId}.enabled.`,
        );
      } else {
        params.changes.push(
          `Removed ${params.pathPrefix}.guilds.${guildId}.channels.${channelId}.allow (${params.pathPrefix}.guilds.${guildId}.channels.${channelId}.enabled already set).`,
        );
      }
      delete nextChannel.allow;
      nextChannels[channelId] = nextChannel;
      channelsChanged = true;
    }
    if (!channelsChanged) {
      continue;
    }
    nextGuilds[guildId] = { ...guild, channels: nextChannels };
    changed = true;
  }

  return changed
    ? { entry: { ...params.entry, guilds: nextGuilds }, changed: true }
    : { entry: params.entry, changed: false };
}

function isDiscordChannelAgentBinding(
  value: unknown,
  match: { accountId?: string; guildId: string; channelId: string },
): value is Record<string, unknown> {
  const binding = asObjectRecord(value);
  const bindingMatch = asObjectRecord(binding?.match);
  const peer = asObjectRecord(bindingMatch?.peer);
  if (!binding || !bindingMatch || !peer) {
    return false;
  }
  return (
    bindingMatch.channel === "discord" &&
    bindingMatch.guildId === match.guildId &&
    (match.accountId === undefined || bindingMatch.accountId === match.accountId) &&
    peer.kind === "channel" &&
    peer.id === match.channelId
  );
}

function normalizeDiscordGuildChannelAgentIds(params: {
  cfg: OpenClawConfig;
  entry: Record<string, unknown>;
  pathPrefix: string;
  accountId?: string;
  changes: string[];
  bindingsToAdd: AgentBindingConfig[];
}): { entry: Record<string, unknown>; changed: boolean } {
  const guilds = asObjectRecord(params.entry.guilds);
  if (!guilds) {
    return { entry: params.entry, changed: false };
  }

  const existingBindings = Array.isArray(params.cfg.bindings) ? params.cfg.bindings : [];
  let changed = false;
  const nextGuilds = { ...guilds };
  for (const [guildId, guildValue] of Object.entries(guilds)) {
    const guild = asObjectRecord(guildValue);
    const channels = asObjectRecord(guild?.channels);
    if (!guild || !channels) {
      continue;
    }
    let channelsChanged = false;
    const nextChannels = { ...channels };
    for (const [channelId, channelValue] of Object.entries(channels)) {
      const channel = asObjectRecord(channelValue);
      if (!channel || !Object.hasOwn(channel, "agentId")) {
        continue;
      }
      const nextChannel = { ...channel };
      const rawAgentId = nextChannel.agentId;
      delete nextChannel.agentId;
      nextChannels[channelId] = nextChannel;
      channelsChanged = true;

      const path = `${params.pathPrefix}.guilds.${guildId}.channels.${channelId}.agentId`;
      const agentId = typeof rawAgentId === "string" ? rawAgentId.trim() : "";
      if (!agentId) {
        params.changes.push(
          `Removed ${path}; configure top-level bindings[] for per-channel Discord agent routing.`,
        );
        continue;
      }

      const match = { accountId: params.accountId, guildId, channelId };
      const existingBinding = existingBindings.find((binding) =>
        isDiscordChannelAgentBinding(binding, match),
      );
      if (existingBinding) {
        params.changes.push(
          `Removed ${path}; a matching top-level bindings[] route already exists for Discord channel ${channelId}.`,
        );
        continue;
      }

      const bindingMatch: AgentBindingConfig["match"] = {
        channel: "discord",
        guildId,
        peer: { kind: "channel", id: channelId },
      };
      if (params.accountId) {
        bindingMatch.accountId = params.accountId;
      }
      params.bindingsToAdd.push({
        agentId,
        match: bindingMatch,
      });
      params.changes.push(
        `Moved ${path} → top-level bindings[] route for Discord channel ${channelId}.`,
      );
    }
    if (!channelsChanged) {
      continue;
    }
    nextGuilds[guildId] = { ...guild, channels: nextChannels };
    changed = true;
  }

  return changed
    ? { entry: { ...params.entry, guilds: nextGuilds }, changed: true }
    : { entry: params.entry, changed: false };
}

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: OpenClawConfig;
}): ChannelDoctorConfigMutation {
  const rawEntry = asObjectRecord((cfg.channels as Record<string, unknown> | undefined)?.discord);
  if (!rawEntry) {
    return { config: cfg, changes: [] };
  }

  const changes: string[] = [];
  let updated = rawEntry;
  let changed = false;
  const bindingsToAdd: AgentBindingConfig[] = [];

  const guildAliases = normalizeDiscordGuildChannelAllowAliases({
    entry: updated,
    pathPrefix: "channels.discord",
    changes,
  });
  updated = guildAliases.entry;
  changed = changed || guildAliases.changed;

  const channelAgentIds = normalizeDiscordGuildChannelAgentIds({
    cfg,
    entry: updated,
    pathPrefix: "channels.discord",
    changes,
    bindingsToAdd,
  });
  updated = channelAgentIds.entry;
  changed = changed || channelAgentIds.changed;

  const accounts = asObjectRecord(updated.accounts);
  if (accounts) {
    let accountsChanged = false;
    const nextAccounts = { ...accounts };
    for (const [accountId, accountValue] of Object.entries(accounts)) {
      const account = asObjectRecord(accountValue);
      if (!account) {
        continue;
      }
      const normalized = normalizeDiscordGuildChannelAllowAliases({
        entry: account,
        pathPrefix: `channels.discord.accounts.${accountId}`,
        changes,
      });
      let nextAccount = normalized.entry;
      let accountChanged = normalized.changed;
      const normalizedAgentIds = normalizeDiscordGuildChannelAgentIds({
        cfg,
        entry: nextAccount,
        pathPrefix: `channels.discord.accounts.${accountId}`,
        accountId,
        changes,
        bindingsToAdd,
      });
      nextAccount = normalizedAgentIds.entry;
      accountChanged = accountChanged || normalizedAgentIds.changed;
      const normalizedWakeNames = normalizeUnsupportedRealtimeWakeNames(
        nextAccount,
        `channels.discord.accounts.${accountId}`,
        changes,
      );
      nextAccount = normalizedWakeNames.entry;
      accountChanged = accountChanged || normalizedWakeNames.changed;
      if (!accountChanged) {
        continue;
      }
      nextAccounts[accountId] = nextAccount;
      accountsChanged = true;
    }
    if (accountsChanged) {
      updated = { ...updated, accounts: nextAccounts };
      changed = true;
    }
  }

  const normalizedWakeNames = normalizeUnsupportedRealtimeWakeNames(
    updated,
    "channels.discord",
    changes,
  );
  updated = normalizedWakeNames.entry;
  changed = changed || normalizedWakeNames.changed;

  if (!changed) {
    return { config: cfg, changes: [] };
  }
  return {
    config: {
      ...cfg,
      channels: {
        ...cfg.channels,
        discord: updated,
      } as OpenClawConfig["channels"],
      bindings:
        bindingsToAdd.length > 0 ? [...(cfg.bindings ?? []), ...bindingsToAdd] : cfg.bindings,
    },
    changes,
  };
}