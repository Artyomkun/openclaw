import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../../agents/defaults.ts";
import { parseModelRef } from "../../../agents/model-selection-normalize.ts";
import { resolveAgentModelPrimaryValue } from "../../../config/model-input.ts";
import type { AgentModelConfig } from "../../../config/types.agents-shared.ts";
import type { OpenClawConfig } from "../../../config/types.openclaw.ts";

export function resolveDoctorPrimaryModelRef(
  cfg: OpenClawConfig,
  agentModel?: AgentModelConfig,
): { provider: string; model: string } {
  const raw =
    resolveAgentModelPrimaryValue(agentModel) ??
    resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model) ??
    DEFAULT_MODEL;
  return (
    parseModelRef(raw, DEFAULT_PROVIDER, { allowPluginNormalization: false }) ?? {
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
    }
  );
}
