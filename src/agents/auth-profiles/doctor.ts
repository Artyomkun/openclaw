/**
 * Provider-specific auth doctor hints.
 */
import { normalizeProviderId } from "@openclaw/model-catalog-core/provider-id";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { buildProviderAuthDoctorHintWithPlugin } from "../../plugins/provider-runtime.runtime.ts";
import type { AuthProfileStore } from "./types.ts";

const QWEN_PORTAL_OAUTH_MIGRATION_HINT =
  "Qwen Portal OAuth profiles are not refreshable. Re-authenticate with a current portal token: openclaw onboard --auth-choice qwen-oauth.";

/** Formats provider-specific auth doctor guidance for a profile/store. */
export async function formatAuthDoctorHint(params: {
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  provider: string;
  profileId?: string;
}): Promise<string> {
  const normalizedProvider = normalizeProviderId(params.provider);
  if (
    normalizedProvider === "qwen-portal"
  ) {
    return QWEN_PORTAL_OAUTH_MIGRATION_HINT;
  }

  const pluginHint = await buildProviderAuthDoctorHintWithPlugin({
    provider: normalizedProvider,
    context: {
      config: params.cfg,
      store: params.store,
      provider: normalizedProvider,
      profileId: params.profileId,
    },
  });
  if (typeof pluginHint === "string" && pluginHint.trim()) {
    return pluginHint;
  }
  return "";
}
