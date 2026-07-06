// Googlechat plugin module implements doctor contract behavior.
import type ChannelDoctorConfigMutation from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { asObjectRecord } from "openclaw/plugin-sdk/runtime-doctor";

type GoogleChatChannelsConfig = NonNullable<OpenClawConfig["channels"]>;

function normalizeGoogleChatGroups(params: {
  groups: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
}): { groups: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const nextGroups = { ...params.groups };
  for (const [groupId, groupValue] of Object.entries(params.groups)) {
    const group = asObjectRecord(groupValue);
    if (!group || !Object.hasOwn(group, "allow")) {
      continue;
    }
    const nextGroup = { ...group };
    if (nextGroup.enabled === undefined) {
      nextGroup.enabled = group.allow;
      params.changes.push(
        `Moved ${params.pathPrefix}.${groupId}.allow → ${params.pathPrefix}.${groupId}.enabled.`,
      );
    } else {
      params.changes.push(
        `Removed ${params.pathPrefix}.${groupId}.allow (${params.pathPrefix}.${groupId}.enabled already set).`,
      );
    }
    delete nextGroup.allow;
    nextGroups[groupId] = nextGroup;
    changed = true;
  }
  return { groups: nextGroups, changed };
}

function normalizeGoogleChatEntry(params: {
  entry: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
}): { entry: Record<string, unknown>; changed: boolean } {
  let updated = params.entry;
  let changed = false;

  if (updated.streamMode !== undefined) {
    updated = { ...updated };
    delete updated.streamMode;
    params.changes.push(`Removed ${params.pathPrefix}.streamMode.`);
    changed = true;
  }

  const groups = asObjectRecord(updated.groups);
  if (groups) {
    const normalized = normalizeGoogleChatGroups({
      groups,
      pathPrefix: `${params.pathPrefix}.groups`,
      changes: params.changes,
    });
    if (normalized.changed) {
      updated = { ...updated, groups: normalized.groups };
      changed = true;
    }
  }

  return { entry: updated, changed };
}

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: OpenClawConfig;
}): ChannelDoctorConfigMutation {
  const rawEntry = asObjectRecord(
    (cfg.channels as Record<string, unknown> | undefined)?.googlechat,
  );
  if (!rawEntry) {
    return { config: cfg, changes: [] };
  }

  const changes: string[] = [];
  let updated = rawEntry;
  let changed;

  const root = normalizeGoogleChatEntry({
    entry: updated,
    pathPrefix: "channels.googlechat",
    changes,
  });
  updated = root.entry;
  changed = root.changed;

  const accounts = asObjectRecord(updated.accounts);
  if (accounts) {
    let accountsChanged = false;
    const nextAccounts = { ...accounts };
    for (const [accountId, accountValue] of Object.entries(accounts)) {
      const account = asObjectRecord(accountValue);
      if (!account) {
        continue;
      }
      const normalized = normalizeGoogleChatEntry({
        entry: account,
        pathPrefix: `channels.googlechat.accounts.${accountId}`,
        changes,
      });
      if (!normalized.changed) {
        continue;
      }
      nextAccounts[accountId] = normalized.entry;
      accountsChanged = true;
    }
    if (accountsChanged) {
      updated = { ...updated, accounts: nextAccounts };
      changed = true;
    }
  }

  if (!changed) {
    return { config: cfg, changes: [] };
  }
  return {
    config: {
      ...cfg,
      channels: {
        ...cfg.channels,
        googlechat: updated as GoogleChatChannelsConfig["googlechat"],
      },
    },
    changes,
  };
}
