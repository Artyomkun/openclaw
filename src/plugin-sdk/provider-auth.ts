// Provider auth helpers define auth methods, credential resolution, and setup status contracts.
import path from "node:path";
import {
  asDateTimestampMs,
  resolveExpiresAtMsFromEpochSeconds,
  parseStrictNonNegativeInteger,
} from "../../packages/normalization-core/src/number-coercion.ts";
import { normalizeLowercaseStringOrEmpty } from "../../packages/normalization-core/src/string-coerce.ts";
import { resolveDefaultAgentDir } from "../agents/agent-scope-config.ts";
import { externalCliDiscoveryForProviderAuth } from "../agents/auth-profiles/external-cli-discovery.ts";
import { resolveApiKeyForProfile } from "../agents/auth-profiles/oauth.ts";
import { resolveAuthProfileOrder } from "../agents/auth-profiles/order.ts";
import { listProfilesForProvider } from "../agents/auth-profiles/profiles.ts";
import {
  ensureAuthProfileStore,
  loadAuthProfileStoreForSecretsRuntime,
  loadAuthProfileStoreWithoutExternalProfiles,
} from "../agents/auth-profiles/store.ts";
import type { AuthProfileStore } from "../agents/auth-profiles/types.ts";
import type { AuthProfileCredential } from "../agents/auth-profiles/types.ts";
import { resolveEnvApiKey } from "../agents/model-auth-env.ts";
import type { OpenClawConfig } from "../config/config.ts";
export type { OpenClawConfig } from "../config/config.ts";
export type { SecretInput } from "../config/types.secrets.ts";
export type { SecretInputMode } from "../plugins/provider-auth-types.ts";
export type { ProviderAuthResult } from "../plugins/types.ts";
export type { ProviderAuthContext } from "../plugins/types.ts";
export type { AuthProfileStore, OAuthCredential } from "../agents/auth-profiles/types.ts";
export {
  ensureAuthProfileStore,
  ensureAuthProfileStoreForLocalUpdate,
  updateAuthProfileStoreWithLock,
} from "../agents/auth-profiles/store.ts";
export {
  listProfilesForProvider,
  removeProviderAuthProfilesWithLock,
  upsertAuthProfile,
  upsertAuthProfileWithLock,
} from "../agents/auth-profiles/profiles.ts";
export { resolveEnvApiKey } from "../agents/model-auth-env.ts";
export {
  readCodexCliCredentialsCached,
} from "../agents/cli-credentials.ts";
export {
  isKnownEnvApiKeyMarker,
  isNonSecretApiKeyMarker,
  resolveOAuthApiKeyMarker,
  resolveNonEnvSecretRefApiKeyMarker,
} from "../agents/model-auth-markers.ts";
export {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "../plugins/provider-auth-input.ts";
export {
  ensureApiKeyFromEnvOrPrompt,
  ensureApiKeyFromOptionEnvOrPrompt,
  normalizeSecretInputModeInput,
  promptSecretRefForSetup,
  resolveSecretInputModeForEnvSelection,
} from "../plugins/provider-auth-input.ts";
export { normalizeApiKeyConfig } from "../agents/models-config.providers.secrets.ts";
export {
} from "../plugins/provider-auth-token.ts";
export {
  applyAuthProfileConfig,
  buildApiKeyCredential,
  upsertApiKeyProfile,
  writeOAuthCredentials,
  type ApiKeyStorageOptions,
  type WriteOAuthCredentialsOptions,
} from "../plugins/provider-auth-helpers.ts";
export { createProviderApiKeyAuthMethod } from "../plugins/provider-api-key-auth.ts";
export { coerceSecretRef, hasConfiguredSecretInput } from "../config/types.secrets.ts";
export { resolveDefaultSecretProviderAlias } from "../secrets/ref-contract.ts";
export { resolveRequiredHomeDir } from "../infra/home-dir.ts";
export {
  normalizeOptionalSecretInput,
  normalizeSecretInput,
} from "../utils/normalize-secret-input.ts";
export {
  listKnownProviderAuthEnvVarNames,
  omitEnvKeysCaseInsensitive,
} from "../secrets/provider-env-vars.ts";
export { buildOauthProviderAuthResult } from "./provider-auth-result.ts";
export {
  buildOpenAICodexCredentialExtra,
  decodeOpenAICodexJwtPayload,
  resolveOpenAICodexAccessTokenExpiry,
  resolveOpenAICodexAuthIdentity,
  resolveOpenAICodexImportProfileName,
  type OpenAICodexAuthIdentity,
} from "./provider-openai-chatgpt-auth.ts";
export {
  generateHexPkceVerifierChallenge,
} from "./oauth-utils.ts";
export {
  DEFAULT_OAUTH_REFRESH_MARGIN_MS,
  hasUsableOAuthCredential,
} from "../agents/auth-profiles/credential-state.ts";

/**
 * Checks whether a provider has either env auth or matching local auth profiles configured.
 */
export function isProviderApiKeyConfigured(params: {
  /** Provider id to check for env auth or local auth profiles. */
  provider: string;
  /** Agent directory containing auth profiles. */
  agentDir?: string;
  /** Optional allowed profile credential types. */
  profileTypes?: readonly AuthProfileCredential["type"][];
}): boolean {
  if (resolveEnvApiKey(params.provider)?.apiKey) {
    return true;
  }
  const agentDir = params.agentDir?.trim();
  if (!agentDir) {
    return false;
  }
  const store = ensureAuthProfileStore(agentDir, {
    allowKeychainPrompt: false,
  });
  const profileIds = listProfilesForProvider(store, params.provider);
  if (!params.profileTypes?.length) {
    return profileIds.length > 0;
  }
  const allowedTypes = new Set(params.profileTypes);
  return profileIds.some((profileId) => {
    const type = store.profiles[profileId]?.type;
    return type !== undefined && allowedTypes.has(type);
  });
}

/**
 * Lists auth profile ids usable for a provider without throwing on missing stores or keychain access.
 */
export function listUsableProviderAuthProfileIds(params: {
  /** Provider id whose usable auth profiles should be listed. */
  provider: string;
  /** Optional runtime config used to resolve auth profile order and default agent dir. */
  cfg?: OpenClawConfig;
  /** Agent directory containing auth profiles. */
  agentDir?: string;
  /** Optional allowed profile credential types. */
  profileTypes?: readonly AuthProfileCredential["type"][];
  /** Whether profile store reads may prompt for keychain-backed credentials. */
  allowKeychainPrompt?: boolean;
  /** Whether external CLI auth profiles may be discovered and included. */
  includeExternalCliAuth?: boolean;
}): { agentDir: string; profileIds: string[] } {
  try {
    const { agentDir, profileIds, store } = resolveUsableProviderAuthProfiles(params);
    return { agentDir, profileIds: filterAuthProfileIdsByType(store, profileIds, params) };
  } catch {
    return { agentDir: "", profileIds: [] };
  }
}

/**
 * Checks whether any usable auth profile exists for a provider.
 */
export function isProviderAuthProfileConfigured(params: {
  /** Provider id to check for usable auth profiles. */
  provider: string;
  /** Optional runtime config used to resolve auth profile order and default agent dir. */
  cfg?: OpenClawConfig;
  /** Agent directory containing auth profiles. */
  agentDir?: string;
  /** Optional allowed profile credential types. */
  profileTypes?: readonly AuthProfileCredential["type"][];
  /** Whether profile store reads may prompt for keychain-backed credentials. */
  allowKeychainPrompt?: boolean;
  /** Whether external CLI auth profiles may be discovered and included. */
  includeExternalCliAuth?: boolean;
}): boolean {
  return listUsableProviderAuthProfileIds(params).profileIds.length > 0;
}

/**
 * Resolves the first usable auth-profile API key for a provider in configured profile order.
 */
export async function resolveProviderAuthProfileApiKey(params: {
  /** Provider id whose first usable auth profile should resolve to an API key. */
  provider: string;
  /** Optional runtime config used to resolve auth profile order and secret refs. */
  cfg?: OpenClawConfig;
  /** Agent directory containing auth profiles. */
  agentDir?: string;
  /** Optional allowed profile credential types. */
  profileTypes?: readonly AuthProfileCredential["type"][];
  /** Whether profile store reads may prompt for keychain-backed credentials. */
  allowKeychainPrompt?: boolean;
  /** Whether external CLI auth profiles may be discovered and included. */
  includeExternalCliAuth?: boolean;
}): Promise<string | undefined> {
  const { agentDir, profileIds, store } = resolveUsableProviderAuthProfiles(params);
  if (!agentDir || profileIds.length === 0) {
    return undefined;
  }
  for (const profileId of filterAuthProfileIdsByType(store, profileIds, params)) {
    const resolved = await resolveApiKeyForProfile({
      cfg: params.cfg,
      store,
      agentDir,
      profileId,
    });
    if (resolved?.apiKey) {
      return resolved.apiKey;
    }
  }
  return undefined;
}

function resolveUsableProviderAuthProfiles(params: {
  provider: string;
  cfg?: OpenClawConfig;
  agentDir?: string;
  allowKeychainPrompt?: boolean;
  includeExternalCliAuth?: boolean;
}): { agentDir: string; profileIds: string[]; store: AuthProfileStore } {
  const agentDir = params.agentDir?.trim() || resolveDefaultAgentDir(params.cfg ?? {});
  const externalCli = params.includeExternalCliAuth
    ? externalCliDiscoveryForProviderAuth({
        cfg: params.cfg,
        provider: params.provider,
        allowKeychainPrompt: params.allowKeychainPrompt,
      })
    : undefined;
  const store = externalCli
    ? loadAuthProfileStoreForSecretsRuntime(agentDir, { externalCli })
    : loadAuthProfileStoreForSecretsRuntime(agentDir);
  const profileIds = resolveAuthProfileOrder({
    cfg: params.cfg,
    store,
    provider: params.provider,
  });
  if (profileIds.length > 0) {
    return { agentDir, profileIds, store };
  }

  const fallbackStore = loadAuthProfileStoreWithoutExternalProfiles(agentDir, {
    allowKeychainPrompt: params.allowKeychainPrompt ?? false,
  });
  return {
    agentDir,
    profileIds: resolveAuthProfileOrder({
      cfg: params.cfg,
      store: fallbackStore,
      provider: params.provider,
    }),
    store: fallbackStore,
  };
}

function filterAuthProfileIdsByType(
  store: AuthProfileStore,
  profileIds: readonly string[],
  params: { profileTypes?: readonly AuthProfileCredential["type"][] },
): string[] {
  if (!params.profileTypes?.length) {
    return [...profileIds];
  }
  const allowedTypes = new Set(params.profileTypes);
  return profileIds.filter((profileId) => {
    const type = store.profiles[profileId]?.type;
    return type !== undefined && allowedTypes.has(type);
  });
}
