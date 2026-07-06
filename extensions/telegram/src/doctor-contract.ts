// Telegram plugin module implements doctor contract behavior.
import type {
  ChannelDoctorConfigMutation,
} from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  asObjectRecord,
} from "openclaw/plugin-sdk/runtime-doctor";

function removeRetiredTelegramDmConfig(params: {
  entry: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
}): { entry: Record<string, unknown>; changed: boolean } {
  let updated = params.entry;
  let changed = false;
  const dm = asObjectRecord(updated.dm);
  if (dm) {
    const { dm: _ignored, ...rest } = updated;
    updated = rest;
    params.changes.push(
      dm.threadReplies === undefined
        ? `Removed ${params.pathPrefix}.dm.`
        : `Removed ${params.pathPrefix}.dm.threadReplies; DM topic sessions now follow Telegram getMe.has_topics_enabled.`,
    );
    changed = true;
  }

  const direct = asObjectRecord(updated.direct);
  if (direct) {
    let directChanged = false;
    const nextDirect = { ...direct };
    for (const [chatId, rawDirectConfig] of Object.entries(direct)) {
      const directConfig = asObjectRecord(rawDirectConfig);
      if (!directConfig || directConfig.threadReplies === undefined) {
        continue;
      }
      const nextDirectConfig = { ...directConfig };
      delete nextDirectConfig.threadReplies;
      nextDirect[chatId] = nextDirectConfig;
      params.changes.push(
        `Removed ${params.pathPrefix}.direct.${chatId}.threadReplies; DM topic sessions now follow Telegram getMe.has_topics_enabled.`,
      );
      directChanged = true;
    }
    if (directChanged) {
      updated = { ...updated, direct: nextDirect };
      changed = true;
    }
  }

  return { entry: updated, changed };
}

function removeRetiredTelegramNativeDraftConfig(params: {
  entry: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
}): { entry: Record<string, unknown>; changed: boolean } {
  const streaming = asObjectRecord(params.entry.streaming);
  const preview = asObjectRecord(streaming?.preview);
  if (
    !streaming ||
    !preview ||
    (preview.nativeToolProgress === undefined && preview.nativeToolProgressAllowFrom === undefined)
  ) {
    return { entry: params.entry, changed: false };
  }

  const nextPreview = { ...preview };
  delete nextPreview.nativeToolProgress;
  delete nextPreview.nativeToolProgressAllowFrom;
  const nextStreaming = { ...streaming };
  if (Object.keys(nextPreview).length > 0) {
    nextStreaming.preview = nextPreview;
  } else {
    delete nextStreaming.preview;
  }

  const updated =
    Object.keys(nextStreaming).length > 0
      ? { ...params.entry, streaming: nextStreaming }
      : Object.fromEntries(Object.entries(params.entry).filter(([key]) => key !== "streaming"));
  params.changes.push(
    `Removed ${params.pathPrefix}.streaming.preview native draft keys; Telegram previews now use rich send/edit messages.`,
  );
  return { entry: updated, changed: true };
}

function resolveCompatibleDefaultGroupEntry(section: Record<string, unknown>): {
  groups: Record<string, unknown>;
  entry: Record<string, unknown>;
} | null {
  const existingGroups = section.groups;
  if (existingGroups !== undefined && !asObjectRecord(existingGroups)) {
    return null;
  }
  const groups = asObjectRecord(existingGroups) ?? {};
  const defaultKey = "*";
  const existingEntry = groups[defaultKey];
  if (existingEntry !== undefined && !asObjectRecord(existingEntry)) {
    return null;
  }
  const entry = asObjectRecord(existingEntry) ?? {};
  return { groups, entry };
}

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: OpenClawConfig;
}): ChannelDoctorConfigMutation {
  const rawEntry = asObjectRecord((cfg.channels as Record<string, unknown> | undefined)?.telegram);
  if (!rawEntry) {
    return { config: cfg, changes: [] };
  }

  const changes: string[] = [];
  let updated = rawEntry;
  let changed = false;

  const removedThreadReplies = removeRetiredTelegramDmConfig({
    entry: updated,
    pathPrefix: "channels.telegram",
    changes,
  });
  updated = removedThreadReplies.entry;
  changed = changed || removedThreadReplies.changed;

  const removedNativeDraft = removeRetiredTelegramNativeDraftConfig({
    entry: updated,
    pathPrefix: "channels.telegram",
    changes,
  });
  updated = removedNativeDraft.entry;
  changed = changed || removedNativeDraft.changed;

  if (updated.groupMentionsOnly !== undefined) {
    const defaultGroupEntry = resolveCompatibleDefaultGroupEntry(updated);
    if (!defaultGroupEntry) {
      changes.push(
        "Skipped channels.telegram.groupMentionsOnly migration because channels.telegram.groups already has an incompatible shape; fix remaining issues manually.",
      );
    } else {
      const { groups, entry } = defaultGroupEntry;
      if (entry.requireMention === undefined) {
        entry.requireMention = updated.groupMentionsOnly;
        groups["*"] = entry;
        updated = { ...updated, groups };
        changes.push(
          'Moved channels.telegram.groupMentionsOnly → channels.telegram.groups."*".requireMention.',
        );
      } else {
        changes.push(
          'Removed channels.telegram.groupMentionsOnly (channels.telegram.groups."*" already set).',
        );
      }
      const { groupMentionsOnly: _ignored, ...rest } = updated;
      updated = rest;
      changed = true;
    }
  }

  const accounts = asObjectRecord(updated.accounts);
  if (accounts) {
    let accountsChanged = false;
    const nextAccounts = { ...accounts };
    for (const [accountId, rawAccount] of Object.entries(accounts)) {
      const account = asObjectRecord(rawAccount);
      if (!account) {
        continue;
      }
      const accountRemovedThreadReplies = removeRetiredTelegramDmConfig({
        entry: account,
        pathPrefix: `channels.telegram.accounts.${accountId}`,
        changes,
      });
      if (accountRemovedThreadReplies.changed) {
        nextAccounts[accountId] = accountRemovedThreadReplies.entry;
        accountsChanged = true;
      }
      const accountRemovedNativeDraft = removeRetiredTelegramNativeDraftConfig({
        entry: nextAccounts[accountId] as Record<string, unknown>,
        pathPrefix: `channels.telegram.accounts.${accountId}`,
        changes,
      });
      if (accountRemovedNativeDraft.changed) {
        nextAccounts[accountId] = accountRemovedNativeDraft.entry;
        accountsChanged = true;
      }
    }
    if (accountsChanged) {
      updated = { ...updated, accounts: nextAccounts };
      changed = true;
    }
  }

  if (!changed && changes.length === 0) {
    return { config: cfg, changes: [] };
  }
  return {
    config: {
      ...cfg,
      channels: {
        ...cfg.channels,
        telegram: updated as unknown as NonNullable<OpenClawConfig["channels"]>["telegram"],
      } as OpenClawConfig["channels"],
    },
    changes,
  };
}
