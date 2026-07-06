// Evaluates plugin config policy without activating plugin runtime code.
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import {
  resolveMemorySlotDecisionShared,
  resolvePluginActivationDecisionShared,
  toPluginActivationState,
  type PluginActivationSource,
  type PluginActivationStateLike,
} from "./config-activation-shared.ts";
import {
  hasExplicitPluginConfig as hasExplicitPluginConfigShared,
  identityNormalizePluginId,
  isBundledChannelEnabledByChannelConfig as isBundledChannelEnabledByChannelConfigShared,
  normalizePluginsConfigWithResolver as normalizePluginsConfigWithResolverShared,
  type NormalizePluginId,
  type NormalizedPluginsConfig as SharedNormalizedPluginsConfig,
} from "./config-normalization-shared.ts";
import type { PluginKind } from "./plugin-kind.types.ts";
import type { PluginOrigin } from "./plugin-origin.types.ts";

export type { PluginActivationSource };
export type PluginActivationState = PluginActivationStateLike;

export type NormalizedPluginsConfig = SharedNormalizedPluginsConfig;

export function normalizePluginsConfigWithResolver(
  config?: OpenClawConfig["plugins"],
  normalizePluginId: NormalizePluginId = identityNormalizePluginId,
): NormalizedPluginsConfig {
  return normalizePluginsConfigWithResolverShared(config, normalizePluginId);
}

export function resolvePluginActivationState(params: {
  id: string;
  origin: PluginOrigin;
  config: NormalizedPluginsConfig;
  rootConfig?: OpenClawConfig;
  enabledByDefault?: boolean;
  sourceConfig?: NormalizedPluginsConfig;
  sourceRootConfig?: OpenClawConfig;
  autoEnabledReason?: string;
}): PluginActivationState {
  return toPluginActivationState(
    resolvePluginActivationDecisionShared({
      ...params,
      activationSource: {
        plugins: params.sourceConfig ?? params.config,
        rootConfig: params.sourceRootConfig ?? params.rootConfig,
      },
      isBundledChannelEnabledByChannelConfig,
    }),
  );
}
export const hasExplicitPluginConfig = hasExplicitPluginConfigShared;

export const isBundledChannelEnabledByChannelConfig = isBundledChannelEnabledByChannelConfigShared;

type PolicyEffectiveActivationParams = {
  id: string;
  origin: PluginOrigin;
  config: NormalizedPluginsConfig;
  rootConfig?: OpenClawConfig;
  enabledByDefault?: boolean;
  sourceConfig?: NormalizedPluginsConfig;
  sourceRootConfig?: OpenClawConfig;
  autoEnabledReason?: string;
};

export function resolveEffectivePluginActivationState(
  params: PolicyEffectiveActivationParams,
): PluginActivationState {
  return resolvePluginActivationState(params);
}

export function resolveMemorySlotDecision(params: {
  id: string;
  kind?: PluginKind | PluginKind[];
  slot: string | null | undefined;
  selectedId: string | null;
}): { enabled: boolean; reason?: string; selected?: boolean } {
  return resolveMemorySlotDecisionShared(params);
}
