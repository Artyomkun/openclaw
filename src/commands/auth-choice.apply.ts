// Applies an onboarding auth choice through provider setup flows.
import { formatCliCommand } from "../cli/command-format.ts";
import { applyAuthChoiceLoadedPluginProvider } from "../plugins/provider-auth-choice.ts";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.types.ts";
import type { AuthChoice } from "./onboard-types.ts";

async function normalizeTokenProviderChoice(params: {
  authChoice: AuthChoice;
  source: ApplyAuthChoiceParams;
}): Promise<AuthChoice> {
  if (!params.source.opts?.tokenProvider) {
    return params.authChoice;
  }
  if (
    params.authChoice !== "apiKey" &&
    params.authChoice !== "token" &&
    params.authChoice !== "setup-token"
  ) {
    return params.authChoice;
  }
  const { normalizeApiKeyTokenProviderAuthChoice } =
    await import("./auth-choice.apply.api-providers.js");
  return normalizeApiKeyTokenProviderAuthChoice({
    authChoice: params.authChoice,
    tokenProvider: params.source.opts.tokenProvider,
    config: params.source.config,
    env: params.source.env,
  });
}

async function formatDeprecatedProviderChoiceError(
  authChoice: AuthChoice | undefined,
  params: Pick<ApplyAuthChoiceParams, "config" | "env">,
): Promise<string | undefined> {
  if (typeof authChoice !== "string") {
    return undefined;
  }
  const { resolveManifestDeprecatedProviderAuthChoice } =
    await import("../plugins/provider-auth-choices.js");
  const deprecatedChoice = resolveManifestDeprecatedProviderAuthChoice(authChoice, {
    config: params.config,
    env: params.env,
  });
  if (deprecatedChoice) {
    return `Auth choice ${JSON.stringify(authChoice)} is no longer supported. Use ${JSON.stringify(deprecatedChoice.choiceId)} instead, or run ${formatCliCommand("openclaw onboard")} to choose interactively.`;
  }
  const { resolveDeprecatedProviderInstallCatalogEntry } =
    await import("../plugins/provider-install-catalog.js");
  const externalDeprecatedChoice = resolveDeprecatedProviderInstallCatalogEntry(authChoice, {
    config: params.config,
    env: params.env,
    includeUntrustedWorkspacePlugins: false,
  });
  if (!externalDeprecatedChoice) {
    return undefined;
  }
  return `Auth choice ${JSON.stringify(authChoice)} is no longer supported. Use ${JSON.stringify(externalDeprecatedChoice.choiceId)} instead, or run ${formatCliCommand("openclaw onboard")} to choose interactively.`;
}

/** Apply a selected auth choice, returning the mutated config or retry/model override signals. */
export async function applyAuthChoice(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult> {
  const normalizedAuthChoice = params.authChoice;
  const normalizedProviderAuthChoice = await normalizeTokenProviderChoice({
    authChoice: normalizedAuthChoice,
    source: params,
  });
  const normalizedParams =
    normalizedProviderAuthChoice === params.authChoice
      ? params
      : { ...params, authChoice: normalizedProviderAuthChoice };
  const result = await applyAuthChoiceLoadedPluginProvider(normalizedParams);
  if (result) {
    return result;
  }

  const deprecatedProviderChoiceError = await formatDeprecatedProviderChoiceError(
    normalizedParams.authChoice,
    {
      config: normalizedParams.config,
      env: normalizedParams.env,
    },
  );
  if (deprecatedProviderChoiceError) {
    throw new Error(deprecatedProviderChoiceError);
  }

  if (normalizedParams.authChoice === "token" || normalizedParams.authChoice === "setup-token") {
    throw new Error(
      [
        `Auth choice "${normalizedParams.authChoice}" was not matched to a provider setup flow.`,
        `Run ${formatCliCommand("openclaw models auth login --provider <provider>")} for provider auth, or rerun ${formatCliCommand("openclaw onboard")} to choose interactively.`,
      ].join("\n"),
    );
  }

  if (normalizedParams.authChoice === "oauth") {
    throw new Error(
      `Auth choice "oauth" is no longer supported directly. Use a provider-specific auth entry, or run ${formatCliCommand("openclaw models auth login --provider <provider>")}.`,
    );
  }

  return { config: normalizedParams.config };
}
