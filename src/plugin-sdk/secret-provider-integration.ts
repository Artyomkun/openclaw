/**
 * Public SDK type surface for plugin-declared secret provider integrations.
 */
export type { PluginManifestSecretProviderIntegration } from "../plugins/manifest.ts";
export type {
  SecretProviderIntegrationPreset,
  SecretProviderIntegrationResolution,
} from "../secrets/provider-integrations.ts";
export type { PluginIntegrationSecretProviderConfig } from "../config/types.secrets.ts";
