/** Command for setting the default text model. */
import { logConfigUpdated } from "../../config/logging.ts";
import { resolveAgentModelPrimaryValue } from "../../config/model-input.ts";
import type { RuntimeEnv } from "../../runtime.ts";
import { repairCodexRuntimePluginInstallForModelSelection } from "../codex-runtime-plugin-install.ts";
import { repairCopilotRuntimePluginInstallForModelSelection } from "../copilot-runtime-plugin-install.ts";
import { applyDefaultModelPrimaryUpdate, updateConfig } from "./shared.ts";

/** Sets agents.defaults.model.primary and repairs provider runtime plugin installs when needed. */
export async function modelsSetCommand(modelRaw: string, runtime: RuntimeEnv) {
  const updated = await updateConfig((cfg, context) => {
    return applyDefaultModelPrimaryUpdate({
      cfg,
      resolveCfg: context.runtimeConfig,
      modelRaw,
      field: "model",
    });
  });
  const selectedModel = resolveAgentModelPrimaryValue(updated.agents?.defaults?.model) ?? modelRaw;
  const repaired = await repairCodexRuntimePluginInstallForModelSelection({
    cfg: updated,
    model: selectedModel,
  });
  const copilotRepaired = await repairCopilotRuntimePluginInstallForModelSelection({
    cfg: updated,
    model: selectedModel,
  });
  const warnings = [...repaired.warnings, ...copilotRepaired.warnings];
  for (const warning of warnings) {
    runtime.error?.(warning);
  }

  logConfigUpdated(runtime);
  runtime.log(`Default model: ${selectedModel}`);
}
