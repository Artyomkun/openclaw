// Shared image-generation implementation helpers for bundled and third-party plugins.

export type { AuthProfileStore } from "../agents/auth-profiles/types.ts";
export type { FallbackAttempt } from "../agents/model-fallback.types.ts";
export type { ImageGenerationProviderPlugin } from "../plugins/types.ts";
export type {
  GeneratedImageAsset,
  ImageGenerationProvider,
  ImageGenerationProviderConfiguredContext,
  ImageGenerationProviderOptions,
  ImageGenerationResolution,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerationSourceImage,
} from "../image-generation/types.ts";
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
  getImageGenerationProvider,
  listImageGenerationProviders,
} from "../image-generation/provider-registry.ts";
export { parseImageGenerationModelRef } from "../image-generation/model-ref.ts";
export { createSubsystemLogger } from "../logging/subsystem.ts";
export { normalizeGooglePreviewModelId as normalizeGoogleModelId } from "./provider-model-shared.ts";
export { getProviderEnvVars } from "../secrets/provider-env-vars.ts";
/** Default OpenAI image model used when image-generation provider config omits one. */
export const OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-2";

type ImageGenerationCoreAuthRuntimeModule =
  typeof import("./image-generation-core.auth.runtime.js");

let imageGenerationCoreAuthRuntimePromise:
  | Promise<ImageGenerationCoreAuthRuntimeModule>
  | undefined;

async function loadImageGenerationCoreAuthRuntime(): Promise<ImageGenerationCoreAuthRuntimeModule> {
  imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime.js");
  return imageGenerationCoreAuthRuntimePromise;
}

/** Resolve image-generation provider API keys through the lazy auth runtime helper. */
export async function resolveApiKeyForProvider(
  ...args: Parameters<ImageGenerationCoreAuthRuntimeModule["resolveApiKeyForProvider"]>
): Promise<Awaited<ReturnType<ImageGenerationCoreAuthRuntimeModule["resolveApiKeyForProvider"]>>> {
  const runtime = await loadImageGenerationCoreAuthRuntime();
  return runtime.resolveApiKeyForProvider(...args);
}
