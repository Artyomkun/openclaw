// OpenAI ChatGPT OAuth helpers manage ChatGPT OAuth login and token refresh.
import { loadActivatedBundledPluginPublicSurfaceModuleSync } from "../../../plugin-sdk/facade-runtime.ts";
import type { RuntimeEnv } from "../../../runtime.ts";
import type { WizardPrompter } from "../../../wizard/prompts.ts";
import { throwIfOAuthLoginAborted, withOAuthLoginAbort } from "./abort.ts";
import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "./types.ts";

// OAuth adapter for the bundled OpenAI/ChatGPT provider surface.
const OPENAI_CODEX_PROVIDER_ID = "openai";

type OpenAICodexOAuthFacade = {
  refreshOpenAICodexToken: (refreshToken: string) => Promise<OAuthCredentials>;
};

function loadOpenAICodexOAuthFacade(): OpenAICodexOAuthFacade {
  return loadActivatedBundledPluginPublicSurfaceModuleSync<OpenAICodexOAuthFacade>({
    dirName: "openai",
    artifactBasename: "api.js",
  });
}

async function refreshViaProviderRuntime(refreshToken: string): Promise<OAuthCredentials> {
  const { refreshProviderOAuthCredentialWithPlugin } =
    await import("../../../plugins/provider-runtime.runtime.js");
  const refreshed = await refreshProviderOAuthCredentialWithPlugin({
    provider: OPENAI_CODEX_PROVIDER_ID,
    context: {
      type: "oauth",
      provider: OPENAI_CODEX_PROVIDER_ID,
      access: "",
      refresh: refreshToken,
      expires: 0,
    },
  });
  if (!refreshed) {
    // Fallback keeps refresh working when the plugin runtime is unavailable but the facade is active.
    return await loadOpenAICodexOAuthFacade().refreshOpenAICodexToken(refreshToken);
  }
  const credentials: Record<string, unknown> = { ...refreshed };
  delete credentials.type;
  delete credentials.provider;
  return credentials as OAuthCredentials;
}

/** Runs the ChatGPT/Codex OAuth login flow and returns normalized credentials. */
export async function loginOpenAICodex(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  throwIfOAuthLoginAborted(callbacks.signal);
  const { loginOpenAICodexOAuth } =
    await import("../../../plugins/provider-openai-chatgpt-oauth.js");
  const manualCodeInput = callbacks.onManualCodeInput;
  const onManualCodeInput = manualCodeInput
    ? async () => await withOAuthLoginAbort(manualCodeInput(), callbacks.signal)
    : undefined;
  const credentials = await withOAuthLoginAbort(
    loginOpenAICodexOAuth({
      isRemote: false,
      signal: callbacks.signal,
      onManualCodeInput,
      openUrl: async (url) => {
        throwIfOAuthLoginAborted(callbacks.signal);
        callbacks.onAuth({ url });
      },
    }),
    callbacks.signal,
  );
  if (!credentials) {
    throw new Error("OpenAI Codex OAuth login did not return credentials.");
  }
  return credentials;
}

/** Refreshes a ChatGPT/Codex OAuth token through the provider runtime or bundled facade. */
export async function refreshOpenAICodexToken(refreshToken: string): Promise<OAuthCredentials> {
  return await refreshViaProviderRuntime(refreshToken);
}

/** OAuth provider descriptor for ChatGPT subscription-backed OpenAI access. */
export const openaiCodexOAuthProvider: OAuthProviderInterface = {
  id: OPENAI_CODEX_PROVIDER_ID,
  name: "ChatGPT Plus/Pro (Codex Subscription)",
  usesCallbackServer: true,

  async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
    return await loginOpenAICodex(callbacks);
  },

  async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    return await refreshOpenAICodexToken(credentials.refresh);
  },

  getApiKey(credentials: OAuthCredentials): string {
    return credentials.access;
  },
};
