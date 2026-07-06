/**
 * Public SDK subpath for API-key provider auth setup and secret input handling.
 */
export type { OpenClawConfig } from "../config/config.ts";
export type { SecretInput } from "../config/types.secrets.ts";

export { upsertAuthProfile, upsertAuthProfileWithLock } from "../agents/auth-profiles/profiles.ts";
export {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
  ensureApiKeyFromOptionEnvOrPrompt,
  normalizeSecretInputModeInput,
  promptSecretRefForSetup,
  resolveSecretInputModeForEnvSelection,
} from "../plugins/provider-auth-input.ts";
export {
  applyAuthProfileConfig,
  buildApiKeyCredential,
  upsertApiKeyProfile,
  type ApiKeyStorageOptions,
} from "../plugins/provider-auth-helpers.ts";
export { createProviderApiKeyAuthMethod } from "../plugins/provider-api-key-auth.ts";
export {
  normalizeOptionalSecretInput,
  normalizeSecretInput,
} from "../utils/normalize-secret-input.ts";
