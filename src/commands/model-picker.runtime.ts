/** Runtime dependency bundle for provider/model picker flows. */
import {
  resolveProviderModelPickerFlowContributions,
  resolveProviderModelPickerFlowEntries,
} from "../flows/provider-flow.runtime.ts";
import { runProviderPluginAuthMethod } from "../plugins/provider-auth-choice.ts";
import {
  resolveProviderPluginChoice,
  runProviderModelSelectedHook,
} from "../plugins/provider-wizard.ts";
import { resolvePluginProviders } from "../plugins/providers.runtime.ts";

/** Lazy runtime methods consumed by model picker command flows. */
export const modelPickerRuntime = {
  resolveProviderModelPickerContributions: resolveProviderModelPickerFlowContributions,
  resolveProviderModelPickerEntries: resolveProviderModelPickerFlowEntries,
  resolveProviderPluginChoice,
  runProviderModelSelectedHook,
  resolvePluginProviders,
  runProviderPluginAuthMethod,
};
