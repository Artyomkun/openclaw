/**
 * Builds model visibility policies with configured fallbacks included.
 */
import { resolveAgentModelFallbackValues } from "../config/model-input.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { resolveAgentModelFallbacksOverride } from "./agent-scope.ts";
import type { ModelCatalogEntry } from "./model-catalog.types.ts";
import type { ModelManifestNormalizationContext } from "./model-selection-normalize.ts";
import {
  createModelVisibilityPolicyWithFallbacks,
  type ModelVisibilityPolicy,
} from "./model-selection-shared.ts";

export const RUNTIME_MODEL_VISIBILITY_NORMALIZATION = {
  allowManifestNormalization: true,
  allowPluginNormalization: true,
} as const;

function resolveAllowedFallbacks(params: { cfg: OpenClawConfig; agentId?: string }): string[] {
  if (params.agentId) {
    const override = resolveAgentModelFallbacksOverride(params.cfg, params.agentId);
    if (override !== undefined) {
      return override;
    }
  }
  return resolveAgentModelFallbackValues(params.cfg.agents?.defaults?.model);
}

export function createModelVisibilityPolicy(
  params: {
    cfg: OpenClawConfig;
    catalog: ModelCatalogEntry[];
    defaultProvider: string;
    defaultModel?: string;
    agentId?: string;
    allowManifestNormalization?: boolean;
    allowPluginNormalization?: boolean;
  } & ModelManifestNormalizationContext,
): ModelVisibilityPolicy {
  return createModelVisibilityPolicyWithFallbacks({
    cfg: params.cfg,
    catalog: params.catalog,
    defaultProvider: params.defaultProvider,
    defaultModel: params.defaultModel,
    fallbackModels: resolveAllowedFallbacks({
      cfg: params.cfg,
      agentId: params.agentId,
    }),
    // Model visibility is used by lightweight status/list paths. Keep plugin
    // manifest normalization opt-in so those paths do not load plugin runtime
    // metadata unless a caller explicitly needs it.
    allowManifestNormalization: params.allowManifestNormalization ?? false,
    allowPluginNormalization: params.allowPluginNormalization ?? false,
    manifestPlugins: params.manifestPlugins,
  });
}

export type { ModelVisibilityPolicy };
