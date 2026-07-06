/**
 * Auth profile API-key/OAuth runtime resolver.
 * Converts selected auth profiles into provider API keys, refreshes OAuth
 * credentials, resolves SecretRefs, and maintains runtime store snapshots.
 */
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { getRuntimeConfig } from "../../config/config.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { coerceSecretRef } from "../../config/types.secrets.ts";
import { formatErrorMessage } from "../../infra/errors.ts";
import {
  getOAuthApiKey,
  getOAuthProviders,
  type OAuthCredentials,
  type OAuthProvider,
} from "../../llm/oauth.ts";
import {
  formatProviderAuthProfileApiKeyWithPlugin,
  refreshProviderOAuthCredentialWithPlugin,
} from "../../plugins/provider-runtime.runtime.ts";
import { resolveSecretRefString, type SecretRefResolveCache } from "../../secrets/resolve.ts";
import { normalizeOptionalSecretInput } from "../../utils/normalize-secret-input.ts";
import { refreshChutesTokens } from "../chutes-oauth.ts";
import { resolveProviderIdForAuth } from "../provider-auth-aliases.ts";
import { log } from "./constants.ts";
import {
  evaluateStoredCredentialEligibility,
  resolveTokenExpiryState,
} from "./credential-state.ts";
import { formatAuthDoctorHint } from "./doctor.ts";
import {
  readExternalCliBootstrapCredential,
  readExternalCliFallbackCredential,
} from "./external-cli-sync.ts";
import { createOAuthManager, OAuthManagerRefreshError } from "./oauth-manager.ts";
import { OAuthRefreshFailureError } from "./oauth-refresh-failure.ts";
import { assertNoOAuthSecretRefPolicyViolations } from "./policy.ts";
import { clearLastGoodProfileWithLock } from "./profiles.ts";
import {
  getRuntimeAuthProfileStoreSnapshot,
  hasRuntimeAuthProfileStoreSnapshot,
  setRuntimeAuthProfileStoreSnapshot,
} from "./runtime-snapshots.ts";
import {
  loadAuthProfileStoreForSecretsRuntime,
  resolvePersistedAuthProfileOwnerAgentDir,
} from "./store.ts";
import type {
  ApiKeyCredential,
  AuthProfileCredential,
  AuthProfileStore,
  OAuthCredential,
  TokenCredential,
} from "./types.ts";

export {
  isSafeToCopyOAuthIdentity,
  isSameOAuthIdentity,
  normalizeAuthEmailToken,
  normalizeAuthIdentityToken,
  shouldMirrorRefreshedOAuthCredential,
} from "./oauth-identity.ts";
export type { OAuthMirrorDecision, OAuthMirrorDecisionReason } from "./oauth-identity.ts";

// ─── OAuth Provider Resolution ─────────────────────────────

function listOAuthProviderIds(): Set<string> {
  if (typeof getOAuthProviders !== "function") return new Set();
  const providers = getOAuthProviders();
  if (!Array.isArray(providers)) return new Set();

  return new Set(
    providers
      .filter(
        (p): p is { id: string } =>
          p !== null &&
          typeof p === "object" &&
          "id" in p &&
          typeof p.id === "string",
      )
      .map((p) => p.id),
  );
}

const OAUTH_PROVIDER_IDS = listOAuthProviderIds();

function isOAuthProvider(provider: string): provider is OAuthProvider {
  return OAUTH_PROVIDER_IDS.has(provider);
}

function resolveOAuthProvider(provider: string): OAuthProvider | null {
  return isOAuthProvider(provider) ? provider : null;
}

// ─── Mode Compatibility ────────────────────────────────────

/** Bearer-token auth modes that are interchangeable (oauth tokens and raw tokens). */
const BEARER_AUTH_MODES: ReadonlySet<string> = new Set(["oauth", "token"]);

function isCompatibleModeType(mode: string | undefined, type: string | undefined): boolean {
  if (!mode || !type) return false;
  if (mode === type) return true;
  return BEARER_AUTH_MODES.has(mode) && BEARER_AUTH_MODES.has(type);
}

function isProfileConfigCompatible(params: {
  cfg?: OpenClawConfig;
  profileId: string;
  provider: string;
  mode: "api_key" | "token" | "oauth";
  allowOAuthTokenCompatibility?: boolean;
}): boolean {
  const profileConfig = params.cfg?.auth?.profiles?.[params.profileId];
  if (!profileConfig) return true; // no config = no restrictions
  if (profileConfig.provider !== params.provider) return false;
  if (!isCompatibleModeType(profileConfig.mode, params.mode)) return false;
  return true;
}

// ─── OAuth API Key Builder ─────────────────────────────────

async function buildOAuthApiKey(
  provider: string,
  credentials: OAuthCredential,
  context: { cfg?: OpenClawConfig },
): Promise<string> {
  const formatted = await formatProviderAuthProfileApiKeyWithPlugin({
    provider,
    config: context.cfg,
    context: credentials,
  });
  return typeof formatted === "string" && formatted.length > 0
    ? formatted
    : credentials.access;
}

// ─── Result Types & Builder ────────────────────────────────

type ResolveApiKeyForProfileResult = {
  apiKey: string;
  provider: string;
  email?: string;
  profileId: string;
  profileType: AuthProfileCredential["type"];
  credential?: AuthProfileCredential;
};

function buildApiKeyProfileResult(params: {
  apiKey: string;
  provider: string;
  email?: string;
  profileId: string;
  profileType: AuthProfileCredential["type"];
  credential?: AuthProfileCredential;
}): ResolveApiKeyForProfileResult {
  const result: Omit<ResolveApiKeyForProfileResult, "profileId" | "profileType" | "credential"> = {
    apiKey: params.apiKey,
    provider: params.provider,
    email: params.email,
  };
  Object.defineProperties(result, {
    profileId: { value: params.profileId, enumerable: false },
    profileType: { value: params.profileType, enumerable: false },
    credential: { value: params.credential, enumerable: false },
  });
  return result as ResolveApiKeyForProfileResult;
}

// ─── Error Helpers ─────────────────────────────────────────

function extractErrorMessage(error: unknown): string {
  return formatErrorMessage(error);
}

export function isRefreshTokenReusedError(error: unknown): boolean {
  const message = normalizeLowercaseStringOrEmpty(extractErrorMessage(error));
  return (
    message.includes("refresh_token_reused") ||
    message.includes("refresh token has already been used") ||
    message.includes("already been used to generate a new access token")
  );
}

// ─── Params Type ───────────────────────────────────────────

type ResolveApiKeyForProfileParams = {
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  profileId: string;
  agentDir?: string;
  forceRefresh?: boolean;
};

type SecretDefaults = NonNullable<OpenClawConfig["secrets"]>["defaults"];

// ─── OAuth Credential Refresh ──────────────────────────────

async function refreshOAuthCredential(
  credential: OAuthCredential,
): Promise<OAuthCredentials | null> {
  const pluginRefreshed = await refreshProviderOAuthCredentialWithPlugin({
    provider: credential.provider,
    context: credential,
  });
  if (pluginRefreshed) return pluginRefreshed;

  if (credential.provider === "chutes") {
    return refreshChutesTokens({ credential });
  }

  const oauthProvider = resolveOAuthProvider(credential.provider);
  if (!oauthProvider || typeof getOAuthApiKey !== "function") return null;

  const result = await getOAuthApiKey(oauthProvider, {
    [credential.provider]: credential,
  });
  return result?.newCredentials ?? null;
}

export async function refreshOAuthCredentialForRuntime(params: {
  credential: OAuthCredential;
}): Promise<OAuthCredential | null> {
  const refreshed = await refreshOAuthCredential(params.credential);
  if (!refreshed) return null;
  return { ...params.credential, ...refreshed, type: "oauth" };
}

// ─── OAuth Manager ─────────────────────────────────────────

const oauthManager = createOAuthManager({
  buildApiKey: buildOAuthApiKey,
  refreshCredential: refreshOAuthCredential,
  readBootstrapCredential: ({ profileId, credential }) =>
    readExternalCliBootstrapCredential({ profileId, credential }),
  readFallbackCredential: ({ profileId, credential }) =>
    credential.provider === "openai"
      ? readExternalCliFallbackCredential({
          profileId,
          credential,
          allowKeychainPrompt: false,
        })
      : null,
  isRefreshTokenReusedError,
});

export function resetOAuthRefreshQueuesForTest(): void {
  oauthManager.resetRefreshQueuesForTest();
}

// ─── Secret Resolution ─────────────────────────────────────

async function resolveProfileSecretString(params: {
  profileId: string;
  provider: string;
  value: string | undefined;
  valueRef: unknown;
  refDefaults: SecretDefaults | undefined;
  configForRefResolution: OpenClawConfig;
  cache: SecretRefResolveCache;
  inlineFailureMessage: string;
  refFailureMessage: string;
}): Promise<string | undefined> {
  let resolvedValue = params.value?.trim();
  if (resolvedValue) {
    const inlineRef = coerceSecretRef(resolvedValue, params.refDefaults);
    if (inlineRef) {
      try {
        resolvedValue = await resolveSecretRefString(inlineRef, {
          config: params.configForRefResolution,
          env: process.env,
          cache: params.cache,
        });
      } catch (err) {
        log.debug(params.inlineFailureMessage, {
          profileId: params.profileId,
          provider: params.provider,
          error: formatErrorMessage(err),
        });
      }
    }
  }

  const explicitRef = coerceSecretRef(params.valueRef, params.refDefaults);
  if (!resolvedValue && explicitRef) {
    try {
      resolvedValue = await resolveSecretRefString(explicitRef, {
        config: params.configForRefResolution,
        env: process.env,
        cache: params.cache,
      });
    } catch (err) {
      log.debug(params.refFailureMessage, {
        profileId: params.profileId,
        provider: params.provider,
        error: formatErrorMessage(err),
      });
    }
  }

  return normalizeOptionalSecretInput(resolvedValue);
}

// ─── OAuth Profile Resolution (fallback) ───────────────────

async function tryResolveOAuthProfile(
  params: ResolveApiKeyForProfileParams & { store: AuthProfileStore },
): Promise<ResolveApiKeyForProfileResult | null> {
  const { cfg, store, profileId, agentDir, forceRefresh } = params;
  const cred = store.profiles[profileId];
  if (!cred || cred.type !== "oauth") return null;

  if (
    !isProfileConfigCompatible({
      cfg,
      profileId,
      provider: cred.provider,
      mode: cred.type,
    })
  ) {
    return null;
  }

  const resolved = await oauthManager.resolveOAuthAccess({
    store,
    profileId,
    credential: cred,
    agentDir,
    cfg,
    forceRefresh,
  });

  if (!resolved) return null;

  return buildApiKeyProfileResult({
    apiKey: resolved.apiKey,
    provider: resolved.credential.provider,
    email: resolved.credential.email ?? cred.email,
    profileId,
    profileType: cred.type,
    credential: resolved.credential,
  });
}

// ─── Main Resolver ─────────────────────────────────────────

export async function resolveApiKeyForProfile(
  params: ResolveApiKeyForProfileParams,
): Promise<ResolveApiKeyForProfileResult> {
  const { cfg, store, profileId, agentDir = "", forceRefresh } = params;
  const cred = store.profiles[profileId];

  if (!cred) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  if (
    !isProfileConfigCompatible({
      cfg,
      profileId,
      provider: cred.provider,
      mode: cred.type,
      allowOAuthTokenCompatibility: true,
    })
  ) {
    throw new Error(`Profile ${profileId} (${cred.type}) is not compatible with current config`);
  }

  const refResolveCache: SecretRefResolveCache = {};
  const configForRefResolution = cfg ?? getRuntimeConfig();
  const refDefaults = configForRefResolution.secrets?.defaults;

  assertNoOAuthSecretRefPolicyViolations({
    store,
    cfg: configForRefResolution,
    profileIds: [profileId],
    context: `auth profile ${profileId}`,
  });

  switch (cred.type) {
    case "api_key":
      return resolveApiKeyCredential({
        cred,
        profileId,
        refDefaults,
        configForRefResolution,
        refResolveCache,
      });
    case "token":
      return resolveTokenCredential({
        cred,
        profileId,
        refDefaults,
        configForRefResolution,
        refResolveCache,
      });
    case "oauth":
      return resolveOAuthCredential({
        cred,
        profileId,
        cfg,
        store,
        agentDir,
        forceRefresh,
      });
    default:
      throw new Error(`Unsupported credential type for profile ${profileId}`);
  }
}

// ─── API Key Credential ────────────────────────────────────

async function resolveApiKeyCredential(params: {
  cred: ApiKeyCredential;
  profileId: string;
  refDefaults: SecretDefaults | undefined;
  configForRefResolution: OpenClawConfig;
  refResolveCache: SecretRefResolveCache;
}): Promise<ResolveApiKeyForProfileResult> {
  const { cred, profileId, refDefaults, configForRefResolution, refResolveCache } = params;

  if (!evaluateStoredCredentialEligibility({ credential: cred }).eligible) {
    throw new Error(`Credential for profile ${profileId} is not eligible`);
  }

  const key = await resolveProfileSecretString({
    profileId,
    provider: cred.provider,
    value: cred.key,
    valueRef: cred.keyRef,
    refDefaults,
    configForRefResolution,
    cache: refResolveCache,
    inlineFailureMessage: "failed to resolve inline auth profile api_key ref",
    refFailureMessage: "failed to resolve auth profile api_key ref",
  });

  if (!key) {
    throw new Error(`Failed to resolve API key for profile ${profileId}`);
  }

  return buildApiKeyProfileResult({
    apiKey: key,
    provider: cred.provider,
    email: cred.email,
    profileId,
    profileType: cred.type,
  });
}

// ─── Token Credential ──────────────────────────────────────

async function resolveTokenCredential(params: {
  cred: TokenCredential;
  profileId: string;
  refDefaults: SecretDefaults | undefined;
  configForRefResolution: OpenClawConfig;
  refResolveCache: SecretRefResolveCache;
}): Promise<ResolveApiKeyForProfileResult> {
  const { cred, profileId, refDefaults, configForRefResolution, refResolveCache } = params;

  const expiryState = resolveTokenExpiryState(cred.expires);
  if (expiryState === "expired" || expiryState === "invalid_expires") {
    throw new Error(`Token for profile ${profileId} is expired`);
  }

  const token = await resolveProfileSecretString({
    profileId,
    provider: cred.provider,
    value: cred.token,
    valueRef: cred.tokenRef,
    refDefaults,
    configForRefResolution,
    cache: refResolveCache,
    inlineFailureMessage: "failed to resolve inline auth profile token ref",
    refFailureMessage: "failed to resolve auth profile token ref",
  });

  if (!token) {
    throw new Error(`Failed to resolve token for profile ${profileId}`);
  }

  return buildApiKeyProfileResult({
    apiKey: token,
    provider: cred.provider,
    email: cred.email,
    profileId,
    profileType: cred.type,
  });
}

// ─── OAuth Credential ──────────────────────────────────────

async function resolveOAuthCredential(
params: {
  cred: OAuthCredential;
  profileId: string;
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  agentDir: string;
  forceRefresh?: boolean;
}): Promise<ResolveApiKeyForProfileResult> {
  const { cred, profileId, cfg, store, agentDir, forceRefresh } = params;

  try {
    const resolved = await oauthManager.resolveOAuthAccess({
      store,
      agentDir,
      profileId,
      credential: cred,
      cfg,
      forceRefresh,
    });

    if (!resolved) {
      throw new Error(`Failed to resolve OAuth access for profile ${profileId}`);
    }

    return buildApiKeyProfileResult({
      apiKey: resolved.apiKey,
      provider: resolved.credential.provider,
      email: resolved.credential.email ?? cred.email,
      profileId,
      profileType: cred.type,
      credential: resolved.credential,
    });
  } catch (error) {
    return handleOAuthRefreshError({
      error: error instanceof Error ? error : new Error(String(error)),
      cred,
      profileId,
      cfg,
      agentDir,
      forceRefresh,
    });
  }
}

// ─── OAuth Error Handler ───────────────────────────────────

async function handleOAuthRefreshError(params: {
  error: Error;
  cred: OAuthCredential;
  profileId: string;
  cfg?: OpenClawConfig;
  agentDir: string;
  forceRefresh?: boolean;
}): Promise<ResolveApiKeyForProfileResult> {
  const { error, cred, profileId, cfg, agentDir, forceRefresh } = params;

  const refreshedStore =
    error instanceof OAuthManagerRefreshError
      ? error.getRefreshedStore()
      : loadAuthProfileStoreForSecretsRuntime(agentDir);

  const surfacedCause =
    error instanceof OAuthManagerRefreshError && error.cause ? error.cause : error;

  const surfacedMessageError =
    error instanceof OAuthManagerRefreshError && error.code === "refresh_contention"
      ? error
      : surfacedCause;

  if (isRefreshTokenReusedError(surfacedCause)) {
    await handleRefreshTokenReuse({
      provider: cred.provider,
      profileId,
      agentDir,
    });
  }

  const fallbackResult = await tryFallbackOAuthResolution({
    cfg,
    refreshedStore,
    agentDir,
    forceRefresh,
    profileId,
  });

  if (fallbackResult) return fallbackResult;

  const message = extractErrorMessage(surfacedMessageError);
  const hint = await formatAuthDoctorHint({
    cfg,
    store: refreshedStore,
    provider: cred.provider,
    profileId,
  });

  throw new OAuthRefreshFailureError({
    provider: cred.provider,
    message:
      `OAuth token refresh failed for ${cred.provider}: ${message}. ` +
      "Please try again or re-authenticate." +
      (hint ? `\n\n${hint}` : ""),
    cause: error,
  });
}

// ─── Refresh Token Reuse Handler ───────────────────────────

async function handleRefreshTokenReuse(params: {
  provider: string;
  profileId: string;
  agentDir: string;
}): Promise<void> {
  const { provider, profileId, agentDir } = params;

  const ownerAgentDir = resolvePersistedAuthProfileOwnerAgentDir({
    agentDir,
    profileId,
  });

  await clearLastGoodProfileWithLock({
    provider,
    profileId,
    agentDir: ownerAgentDir,
  });

  if (agentDir === ownerAgentDir) return;
  if (!hasRuntimeAuthProfileStoreSnapshot(agentDir)) return;

  const snapshot = getRuntimeAuthProfileStoreSnapshot(agentDir);
  const providerKey = resolveProviderIdForAuth(provider);

  if (snapshot?.lastGood?.[providerKey] !== profileId) return;

  delete snapshot.lastGood[providerKey];
  if (Object.keys(snapshot.lastGood).length === 0) {
    delete snapshot.lastGood;
  }
  setRuntimeAuthProfileStoreSnapshot(snapshot, agentDir);
}

// ─── Fallback Resolution ───────────────────────────────────

async function tryFallbackOAuthResolution(params: {
  cfg?: OpenClawConfig;
  refreshedStore: AuthProfileStore;
  agentDir: string;
  forceRefresh?: boolean;
  profileId: string;
}): Promise<ResolveApiKeyForProfileResult | null> {
  const { cfg, refreshedStore, agentDir, forceRefresh, profileId } = params;
  return await tryResolveOAuthProfile({
    cfg,
    store: refreshedStore,
    profileId,
    agentDir,
    forceRefresh,
  });
}