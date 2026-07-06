// Public contract-safe web-search registration helpers for provider plugins.

import type { OpenClawConfig } from "../config/types.openclaw.ts";
import type {
  WebSearchCredentialResolutionSource,
  WebSearchProviderSetupContext,
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderToolExecutionContext,
} from "../plugins/types.ts";
import { enablePluginInConfig } from "./provider-enable-config.ts";
import {
  createBaseWebSearchProviderContractFields,
  type CreateWebSearchProviderContractFieldsOptions,
} from "./provider-web-search-contract-fields.ts";
export {
  getScopedCredentialValue,
  getTopLevelCredentialValue,
  mergeScopedSearchConfig,
  resolveProviderWebSearchPluginConfig,
  setScopedCredentialValue,
  setProviderWebSearchPluginConfigValue,
  setTopLevelCredentialValue,
} from "../agents/tools/web-search-provider-config.ts";
export { enablePluginInConfig } from "./provider-enable-config.ts";
export type {
  WebSearchCredentialResolutionSource,
  WebSearchProviderSetupContext,
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderToolExecutionContext,
};
export type {
  CreateWebSearchProviderContractFieldsOptions,
  WebSearchProviderConfiguredCredential,
  WebSearchProviderContractCredential,
  WebSearchProviderContractFields,
} from "./provider-web-search-contract-fields.ts";

type CreateWebSearchProviderSelectionOptions = CreateWebSearchProviderContractFieldsOptions & {
  /** Plugin id to enable when this provider is selected through setup/configuration flows. */
  selectionPluginId?: string;
};

/** Build the public web-search provider hooks, including optional selection-time plugin enabling. */
export function createWebSearchProviderContractFields(
  options: CreateWebSearchProviderSelectionOptions,
): Pick<
  WebSearchProviderPlugin,
  "inactiveSecretPaths" | "getCredentialValue" | "setCredentialValue"
> &
  Partial<
    Pick<
      WebSearchProviderPlugin,
      "applySelectionConfig" | "getConfiguredCredentialValue" | "setConfiguredCredentialValue"
    >
  > {
  const selectionPluginId = options.selectionPluginId;

  return {
    ...createBaseWebSearchProviderContractFields(options),
    ...(selectionPluginId
      ? {
          applySelectionConfig: (config: OpenClawConfig) =>
            enablePluginInConfig(config, selectionPluginId).config,
        }
      : {}),
  };
}
