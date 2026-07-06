/**
 * Auth profile repair helpers.
 * Migrates older provider:default OAuth config references to safer modern
 * profile ids chosen from store metadata and auth order.
 */
import {
  findNormalizedProviderKey,
  normalizeProviderId,
} from "@openclaw/model-catalog-core/provider-id";
import type { AuthProfileConfig } from "../../config/types.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { resolveAuthProfileMetadata } from "./identity.ts";
import { dedupeProfileIds } from "./profile-list.ts";
import type { AuthProfileIdRepairResult, AuthProfileStore } from "./types.ts";

/** Migrates config auth profile references away from an older OAuth default id. */
export function repairOAuthProfileIdMismatch(params: {
  cfg: OpenClawConfig;
  store: AuthProfileStore;
  provider: string;
  fromProfileId: string;
  toProfileId: string;
}): AuthProfileIdRepairResult {
  const { cfg, store, provider, fromProfileId, toProfileId } = params;

  // Skip repair if destination profile already exists as a separate
  // user-configured account. Overwriting it would destroy the existing
  // account's config (displayName, email, etc.) and collapse two distinct
  // accounts into one.
  if (cfg.auth?.profiles?.[toProfileId]) {
    return { config: cfg, changes: [], migrated: false };
  }

  // Resolve metadata from the destination profile in the store
  const { email: toEmail, displayName: toDisplayName } = resolveAuthProfileMetadata({
    cfg,
    store,
    profileId: toProfileId,
  });

  // Build the replacement profile config
  const replacementProfile: AuthProfileConfig = {
    provider,
    mode: 'oauth',
    ...(toDisplayName ? { displayName: toDisplayName } : {}),
    ...(toEmail ? { email: toEmail } : {}),
  };

  // Remove the old profile and add the new one
  const nextProfiles: Record<string, AuthProfileConfig> = {
    ...cfg.auth?.profiles,
  };
  delete nextProfiles[fromProfileId];
  nextProfiles[toProfileId] = replacementProfile;

  // Update auth order: replace fromProfileId with toProfileId
  const providerKey = normalizeProviderId(provider);
  const nextOrder = (() => {
    const order = cfg.auth?.order;
    if (!order) return undefined;

    const resolvedKey = findNormalizedProviderKey(order, providerKey);
    if (!resolvedKey) return order;

    const existing = order[resolvedKey];
    if (!Array.isArray(existing)) return order;

    const replaced = existing
      .map((id) => (id === fromProfileId ? toProfileId : id))
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

    const deduped = dedupeProfileIds(replaced);
    return { ...order, [resolvedKey]: deduped };
  })();

  const nextCfg: OpenClawConfig = {
    ...cfg,
    auth: {
      ...cfg.auth,
      profiles: nextProfiles,
      ...(nextOrder ? { order: nextOrder } : {}),
    },
  };

  return {
    config: nextCfg,
    changes: [`Migrated profile: ${fromProfileId} → ${toProfileId} (${provider})`],
    migrated: true,
  };
}