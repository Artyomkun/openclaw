/**
 * Runtime-only provider plugin helpers for non-interactive onboarding.
 *
 * Kept behind a lazy boundary so ordinary local setup can infer core auth
 * choices without loading plugin provider discovery.
 */
import { resolveProviderPluginChoice } from "../../../plugins/provider-wizard.ts";
import { resolveOwningPluginIdsForProviderRef } from "../../../plugins/providers.ts";
import { resolvePluginProviders } from "../../../plugins/providers.runtime.ts";

/** Provider discovery surface used by non-interactive auth-choice handling. */
export const authChoicePluginProvidersRuntime = {
  resolveOwningPluginIdsForProviderRef,
  resolveProviderPluginChoice,
  resolvePluginProviders,
};
