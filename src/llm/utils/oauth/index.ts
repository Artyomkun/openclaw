/**
 * OAuth credential management for AI providers.
 *
 * This module handles login, token refresh, and credential storage
 * for OAuth-based providers:
 * - Anthropic (Claude Pro/Max)
 * - GitHub Copilot
 */

// Anthropic
export { anthropicOAuthProvider, loginAnthropic, refreshAnthropicToken } from "./anthropic.ts";
// GitHub Copilot
export {
  getGitHubCopilotBaseUrl,
  githubCopilotOAuthProvider,
  loginGitHubCopilot,
  normalizeDomain,
  refreshGitHubCopilotToken,
} from "./github-copilot.ts";
// OpenAI Codex (ChatGPT OAuth)
export {
  loginOpenAICodex,
  openaiCodexOAuthProvider,
  refreshOpenAICodexToken,
} from "./openai-chatgpt.ts";

export * from "./types.ts";

// ============================================================================
// Provider Registry
// ============================================================================

import { anthropicOAuthProvider } from "./anthropic.ts";
import { githubCopilotOAuthProvider } from "./github-copilot.ts";
import { openaiCodexOAuthProvider } from "./openai-chatgpt.ts";
import type {
  OAuthCredentials,
  OAuthProviderId,
  OAuthProviderInterface,
} from "./types.ts";

const BUILT_IN_OAUTH_PROVIDERS: OAuthProviderInterface[] = [
  anthropicOAuthProvider,
  githubCopilotOAuthProvider,
  openaiCodexOAuthProvider,
];

const oauthProviderRegistry = new Map<string, OAuthProviderInterface>(
  BUILT_IN_OAUTH_PROVIDERS.map((provider) => [provider.id, provider]),
);

/**
 * Get an OAuth provider by ID
 */
export function getOAuthProvider(id: OAuthProviderId): OAuthProviderInterface | undefined {
  return oauthProviderRegistry.get(id);
}

/**
 * Register a custom OAuth provider
 */
export function registerOAuthProvider(provider: OAuthProviderInterface): void {
  oauthProviderRegistry.set(provider.id, provider);
}

/**
 * Reset OAuth providers to built-ins.
 */
export function resetOAuthProviders(): void {
  oauthProviderRegistry.clear();
  for (const provider of BUILT_IN_OAUTH_PROVIDERS) {
    oauthProviderRegistry.set(provider.id, provider);
  }
}

/**
 * Get all registered OAuth providers
 */
export function getOAuthProviders(): OAuthProviderInterface[] {
  return Array.from(oauthProviderRegistry.values());
}

// ============================================================================
// High-level API (uses provider registry)
// ============================================================================

/**
 * Get API key for a provider from OAuth credentials.
 * Automatically refreshes expired tokens.
 *
 * @returns API key string and updated credentials, or null if no credentials
 * @throws Error if refresh fails
 */
export async function getOAuthApiKey(
  providerId: OAuthProviderId,
  credentials: Record<string, OAuthCredentials>,
): Promise<{ newCredentials: OAuthCredentials; apiKey: string } | null> {
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  let creds = credentials[providerId];
  if (!creds) {
    return null;
  }

  // Refresh if expired
  if (Date.now() >= creds.expires) {
    try {
      creds = await provider.refreshToken(creds);
    } catch (error) {
      throw new Error(`Failed to refresh OAuth token for ${providerId}`, { cause: error });
    }
  }

  const apiKey = provider.getApiKey(creds);
  return { newCredentials: creds, apiKey };
}
