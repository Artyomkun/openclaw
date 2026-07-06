/**
 * Public auth-profile barrel for agent/provider auth code.
 * Keep external callers on these exported contracts instead of deep
 * auth-profile implementation files.
 */
export { CLAUDE_CLI_PROFILE_ID, CODEX_CLI_PROFILE_ID } from "./auth-profiles/constants.ts";
export type {
  AuthCredentialReasonCode,
  TokenExpiryState,
} from "./auth-profiles/credential-state.ts";
export type { AuthProfileEligibilityReasonCode } from "./auth-profiles/order.ts";
export { resolveAuthProfileDisplayLabel } from "./auth-profiles/display.ts";
export { formatAuthDoctorHint } from "./auth-profiles/doctor.ts";
export {
  externalCliDiscoveryForConfigStatus,
  externalCliDiscoveryForProviderAuth,
  externalCliDiscoveryForProviders,
  externalCliDiscoveryNone,
  externalCliDiscoveryScoped,
  type ExternalCliAuthDiscovery,
} from "./auth-profiles/external-cli-discovery.ts";
export {
  refreshOAuthCredentialForRuntime,
  resolveApiKeyForProfile,
} from "./auth-profiles/oauth.ts";
export {
  isConfiguredAwsSdkAuthProfileForProvider,
  isStoredCredentialCompatibleWithAuthProvider,
  resolveAuthProfileEligibility,
  resolveAuthProfileOrder,
} from "./auth-profiles/order.ts";
export {
  resolveAuthStatePathForDisplay,
  resolveAuthStorePathForDisplay,
} from "./auth-profiles/paths.ts";
export {
  dedupeProfileIds,
  listProfilesForProvider,
  markAuthProfileSuccess,
  removeProviderAuthProfilesWithLock,
  resolveSubscriptionAuthModeForProfiles,
  setAuthProfileOrder,
  upsertAuthProfile,
  upsertAuthProfileWithLock,
} from "./auth-profiles/profiles.ts";
export {
  repairOAuthProfileIdMismatch
} from "./auth-profiles/repair.ts";
export {
  buildPortableAuthProfileSecretsStoreForAgentCopy,
  isAuthProfileCredentialPortableForAgentCopy,
  resolveAuthProfilePortability,
  type AuthProfilePortability,
  type AuthProfilePortabilityReason,
} from "./auth-profiles/portability.ts";
export {
  clearRuntimeAuthProfileStoreSnapshots,
  ensureAuthProfileStore,
  ensureAuthProfileStoreWithoutExternalProfiles,
  getRuntimeAuthProfileStoreSnapshot,
  hasAnyAuthProfileStoreSource,
  hasLocalAuthProfileStoreSource,
  loadAuthProfileStoreForSecretsRuntime,
  loadAuthProfileStoreWithoutExternalProfiles,
  loadAuthProfileStoreForRuntime,
  replaceRuntimeAuthProfileStoreSnapshots,
  loadAuthProfileStore,
  saveAuthProfileStore,
  findPersistedAuthProfileCredential,
  resolvePersistedAuthProfileOwnerAgentDir,
} from "./auth-profiles/store.ts";
export type {
  ApiKeyCredential,
  AuthProfileBlockedReason,
  AuthProfileBlockedSource,
  AuthProfileCredential,
  AuthProfileFailureReason,
  AuthProfileIdRepairResult,
  AuthProfileState,
  AuthProfileStore,
  OAuthCredential,
  ProfileUsageStats,
  TokenCredential,
} from "./auth-profiles/types.ts";
export {
  calculateAuthProfileCooldownMs,
  clearAuthProfileCooldown,
  clearExpiredCooldowns,
  getSoonestCooldownExpiry,
  isProfileInCooldown,
  markAuthProfileCooldown,
  markAuthProfileBlockedUntil,
  markAuthProfileFailure,
  resolveProfilesUnavailableReason,
  resolveProfileUnusableUntilForDisplay,
  setAuthProfileFailureHook,
} from "./auth-profiles/usage.ts";
