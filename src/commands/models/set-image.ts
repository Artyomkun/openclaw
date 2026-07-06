/** Command for setting the default image model. */
import { logConfigUpdated } from "../../config/logging.ts";
import { resolveAgentModelPrimaryValue } from "../../config/model-input.ts";
import type { RuntimeEnv } from "../../runtime.ts";
import { applyDefaultModelPrimaryUpdate, updateConfig } from "./shared.ts";

/** Sets agents.defaults.imageModel.primary after resolving aliases/catalog provider aliases. */
export async function modelsSetImageCommand(modelRaw: string, runtime: RuntimeEnv) {
  const updated = await updateConfig((cfg) => {
    return applyDefaultModelPrimaryUpdate({ cfg, modelRaw, field: "imageModel" });
  });

  logConfigUpdated(runtime);
  runtime.log(
    `Image model: ${resolveAgentModelPrimaryValue(updated.agents?.defaults?.imageModel) ?? modelRaw}`,
  );
}
