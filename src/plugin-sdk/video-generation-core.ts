// Shared video-generation implementation helpers for bundled and third-party plugins.

export type { AuthProfileStore } from "../agents/auth-profiles/types.ts";
export type { FallbackAttempt } from "../agents/model-fallback.types.ts";
export type { VideoGenerationProviderPlugin } from "../plugins/types.ts";
export type {
  GeneratedVideoAsset,
  VideoGenerationIgnoredOverride,
  VideoGenerationMode,
  VideoGenerationModeCapabilities,
  VideoGenerationModelCapabilitiesContext,
  VideoGenerationProvider,
  VideoGenerationProviderCapabilities,
  VideoGenerationProviderConfiguredContext,
  VideoGenerationRequest,
  VideoGenerationResolution,
  VideoGenerationResult,
  VideoGenerationSourceAsset,
  VideoGenerationTransformCapabilities,
} from "../video-generation/types.ts";
export type { OpenClawConfig } from "../config/types.openclaw.ts";

export { describeFailoverError, isFailoverError } from "../agents/failover-error.ts";
export {
  buildNoCapabilityModelConfiguredMessage,
  resolveCapabilityModelCandidates,
  throwCapabilityGenerationFailure,
} from "../media-generation/runtime-shared.ts";
export {
  resolveAgentModelFallbackValues,
  resolveAgentModelPrimaryValue,
} from "../config/model-input.ts";
export {
  getVideoGenerationProvider,
  listVideoGenerationProviders,
} from "../video-generation/provider-registry.ts";
export { parseVideoGenerationModelRef } from "../video-generation/model-ref.ts";
export { createSubsystemLogger } from "../logging/subsystem.ts";
export { getProviderEnvVars } from "../secrets/provider-env-vars.ts";
