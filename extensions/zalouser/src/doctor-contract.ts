// Zalouser plugin module implements doctor contract behavior.
import type {
  ChannelDoctorConfigMutation,
} from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";

type ZalouserChannelsConfig = NonNullable<OpenClawConfig["channels"]>;

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeZalouserGroupAllowAliases(params: {
  groups: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
}): { groups: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const nextGroups: Record<string, unknown> = { ...params.groups };
  for (const [groupId, groupValue] of Object.entries(params.groups)) {
    const group = asObjectRecord(groupValue);
    if (!group || typeof group.allow !== "boolean") {
      continue;
    }
    const nextGroup = { ...group };
    if (typeof nextGroup.enabled !== "boolean") {
      nextGroup.enabled = group.allow;
    }
    delete nextGroup.allow;
    nextGroups[groupId] = nextGroup;
    changed = true;
    params.changes.push(
      `Moved ${params.pathPrefix}.${groupId}.allow → ${params.pathPrefix}.${groupId}.enabled (${String(nextGroup.enabled)}).`,
    );
  }
  return { groups: nextGroups, changed };
}

function normalizeZalouserCompatibilityConfig(cfg: OpenClawConfig): ChannelDoctorConfigMutation {
  const channels = asObjectRecord(cfg.channels);
  const zalouser = asObjectRecord(channels?.zalouser);
  if (!zalouser) {
    return { config: cfg, changes: [] };
  }

  const changes: string[] = [];
  let updatedZalouser: Record<string, unknown> = zalouser;
  let changed = false;

  const groups = asObjectRecord(updatedZalouser.groups);
  if (groups) {
    const normalized = normalizeZalouserGroupAllowAliases({
      groups,
      pathPrefix: "channels.zalouser.groups",
      changes,
    });
    if (normalized.changed) {
      updatedZalouser = { ...updatedZalouser, groups: normalized.groups };
      changed = true;
    }
  }

  const accounts = asObjectRecord(updatedZalouser.accounts);
  if (accounts) {
    let accountsChanged = false;
    const nextAccounts: Record<string, unknown> = { ...accounts };
    for (const [accountId, accountValue] of Object.entries(accounts)) {
      const account = asObjectRecord(accountValue);
      if (!account) {
        continue;
      }
      const accountGroups = asObjectRecord(account.groups);
      if (!accountGroups) {
        continue;
      }
      const normalized = normalizeZalouserGroupAllowAliases({
        groups: accountGroups,
        pathPrefix: `channels.zalouser.accounts.${accountId}.groups`,
        changes,
      });
      if (!normalized.changed) {
        continue;
      }
      nextAccounts[accountId] = {
        ...account,
        groups: normalized.groups,
      };
      accountsChanged = true;
    }
    if (accountsChanged) {
      updatedZalouser = { ...updatedZalouser, accounts: nextAccounts };
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
        zalouser: updatedZalouser as ZalouserChannelsConfig["zalouser"],
      },
    },
    changes,
  };
}

export function normalizeCompatibilityConfig(params: {
  cfg: OpenClawConfig;
}): ChannelDoctorConfigMutation {
  return normalizeZalouserCompatibilityConfig(params.cfg);
}
