/**
 * Public Codex native web-search facade. It re-exports core activation helpers
 * and reports whether native search matters for the configured agent model.
 */
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import {
  hasAvailableCodexAuth,
  isCodexNativeSearchEligibleModel,
} from "./codex-native-web-search-core.ts";
import { resolveCodexNativeWebSearchConfig } from "./codex-native-web-search.shared.ts";
import { resolveDefaultModelForAgent } from "./model-selection.ts";

export {
  buildCodexNativeWebSearchTool,
  patchCodexNativeWebSearchPayload,
  resolveCodexNativeSearchActivation,
  shouldSuppressManagedWebSearchTool,
} from "./codex-native-web-search-core.ts";
export {
  describeCodexNativeWebSearch,
  resolveCodexNativeWebSearchConfig,
} from "./codex-native-web-search.shared.ts";

/** True when Codex native web search should appear relevant for an agent. */
export function isCodexNativeWebSearchRelevant(params: {
  config: OpenClawConfig;
  agentId?: string;
  agentDir?: string;
}): boolean {
  if (resolveCodexNativeWebSearchConfig(params.config).enabled) {
    return true;
  }
  if (hasAvailableCodexAuth(params)) {
    return true;
  }

  const defaultModel = resolveDefaultModelForAgent({
    cfg: params.config,
    agentId: params.agentId,
  });
  const configuredProvider = params.config.models?.providers?.[defaultModel.provider];
  const configuredModelApi = configuredProvider?.models?.find(
    (candidate) => candidate.id === defaultModel.model,
  )?.api;
  // If explicit config/auth did not opt in, model API eligibility can still make
  // native search relevant for Codex-routable defaults.
  return isCodexNativeSearchEligibleModel({
    modelProvider: defaultModel.provider,
    modelApi: configuredModelApi ?? configuredProvider?.api,
  });
}
