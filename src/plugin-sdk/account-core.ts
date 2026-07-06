// Account core contracts re-export config and account types used by plugin account flows.
export type { OpenClawConfig } from "../config/config.ts";

export { createAccountActionGate } from "../channels/plugins/account-action-gate.ts";
export {
  createAccountListHelpers,
  describeAccountSnapshot,
  hasConfiguredAccountValue,
  listCombinedAccountIds,
  mergeAccountConfig,
  resolveListedDefaultAccountId,
  resolveMergedAccountConfig,
} from "../channels/plugins/account-helpers.ts";
export { normalizeChatType } from "../channels/chat-type.ts";
export { resolveAccountEntry, resolveNormalizedAccountEntry } from "../routing/account-lookup.ts";
export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "../routing/session-key.ts";
export { normalizeE164, pathExists, resolveUserPath } from "../utils.ts";
export { listConfiguredAccountIds } from "./account-configured-ids.ts";

/** Resolve an account by id, then fall back to the default account when the primary lacks credentials. */
export function resolveAccountWithDefaultFallback<TAccount>(params: {
  accountId?: string | null;
  normalizeAccountId: (accountId?: string | null) => string;
  resolvePrimary: (accountId: string) => TAccount;
  hasCredential: (account: TAccount) => boolean;
  resolveDefaultAccountId: () => string;
}): TAccount {
  const hasExplicitAccountId = Boolean(params.accountId?.trim());
  const normalizedAccountId = params.normalizeAccountId(params.accountId);
  const primary = params.resolvePrimary(normalizedAccountId);
  if (hasExplicitAccountId || params.hasCredential(primary)) {
    return primary;
  }

  const fallbackId = params.resolveDefaultAccountId();
  if (fallbackId === normalizedAccountId) {
    return primary;
  }
  const fallback = params.resolvePrimary(fallbackId);
  if (!params.hasCredential(fallback)) {
    return primary;
  }
  return fallback;
}
