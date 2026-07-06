/**
 * @deprecated Public SDK subpath has no bundled extension production imports.
 * Prefer plugin-owned music provider surfaces until a current shared contract
 * is needed by bundled extensions.
 */

export type { AuthProfileStore } from "../agents/auth-profiles/types.ts";
export type { FallbackAttempt } from "../agents/model-fallback.types.ts";
export type { OpenClawConfig } from "../config/types.openclaw.ts";
export type { MusicGenerationProviderPlugin } from "../plugins/types.ts";
export type {
  GeneratedMusicAsset,
  MusicGenerationOutputFormat,
  MusicGenerationProvider,
  MusicGenerationProviderCapabilities,
  MusicGenerationRequest,
  MusicGenerationResult,
  MusicGenerationSourceImage,
} from "../music-generation/types.ts";

export { describeFailoverError, isFailoverError } from "../agents/failover-error.ts";
export {
  resolveAgentModelFallbackValues,
  resolveAgentModelPrimaryValue,
} from "../config/model-input.ts";
export { createSubsystemLogger } from "../logging/subsystem.ts";
export { parseMusicGenerationModelRef } from "../music-generation/model-ref.ts";
export {
  getMusicGenerationProvider,
  listMusicGenerationProviders,
} from "../music-generation/provider-registry.ts";
export { getProviderEnvVars } from "../secrets/provider-env-vars.ts";
