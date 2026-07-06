/** Runtime entrypoint for image generation with provider fallback and override normalization. */
import { describeFailoverError, isFailoverError } from "../agents/failover-error.ts";
import type { FallbackAttempt } from "../agents/model-fallback.types.ts";
import { resolveAgentModelTimeoutMsValue } from "../config/model-input.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { formatErrorMessage } from "../infra/errors.ts";
import { createSubsystemLogger } from "../logging/subsystem.ts";
import {
  buildMediaGenerationNormalizationMetadata,
  buildNoCapabilityModelConfiguredMessage,
  resolveCapabilityModelCandidates,
  resolveMediaProviderRequestTimeoutMs,
  throwCapabilityGenerationFailure,
} from "../media-generation/runtime-shared.ts";
import { getProviderEnvVars } from "../secrets/provider-env-vars.ts";
import { parseImageGenerationModelRef } from "./model-ref.ts";
import { resolveImageGenerationOverrides } from "./normalization.ts";
import { getImageGenerationProvider, listImageGenerationProviders } from "./provider-registry.ts";
import type { GenerateImageParams, GenerateImageRuntimeResult } from "./runtime-types.ts";
import type { ImageGenerationResult } from "./types.ts";

const log = createSubsystemLogger("image-generation");

// Runtime dependency seam for tests and plugin-host callers. Production uses
// the plugin registry and provider-env helpers by default.
/** Dependency seam used by image-generation runtime tests and plugin host callers. */
export type ImageGenerationRuntimeDeps = {
  getProvider?: typeof getImageGenerationProvider;
  listProviders?: typeof listImageGenerationProviders;
  getProviderEnvVars?: typeof getProviderEnvVars;
  log?: Pick<typeof log, "warn">;
};

export type { GenerateImageParams, GenerateImageRuntimeResult } from "./runtime-types.ts";

function buildNoImageGenerationModelConfiguredMessage(
  cfg: OpenClawConfig,
  deps: ImageGenerationRuntimeDeps,
): string {
  const listProviders = deps.listProviders ?? listImageGenerationProviders;
  return buildNoCapabilityModelConfiguredMessage({
    capabilityLabel: "image-generation",
    modelConfigKey: "imageGenerationModel",
    providers: listProviders(cfg),
    getProviderEnvVars: deps.getProviderEnvVars,
  });
}

/** Lists image-generation providers visible for the current config. */
export function listRuntimeImageGenerationProviders(
  params?: { config?: OpenClawConfig },
  deps: ImageGenerationRuntimeDeps = {},
) {
  return (deps.listProviders ?? listImageGenerationProviders)(params?.config);
}

export async function generateImage(
  params: GenerateImageParams,
  deps: ImageGenerationRuntimeDeps = {},
): Promise<GenerateImageRuntimeResult> {
  const getProvider = deps.getProvider ?? getImageGenerationProvider;
  const listProviders = deps.listProviders ?? listImageGenerationProviders;
  const logger = deps.log ?? log;
  const requestedTimeoutMs =
    params.timeoutMs ??
    resolveAgentModelTimeoutMsValue(params.cfg.agents?.defaults?.imageGenerationModel);
  const candidates = resolveCapabilityModelCandidates({
    cfg: params.cfg,
    modelConfig: params.cfg.agents?.defaults?.imageGenerationModel,
    modelOverride: params.modelOverride,
    parseModelRef: parseImageGenerationModelRef,
    agentDir: params.agentDir,
    listProviders,
    autoProviderFallback: params.autoProviderFallback,
  });
  if (candidates.length === 0) {
    throw new Error(buildNoImageGenerationModelConfiguredMessage(params.cfg, deps));
  }

  const attempts: FallbackAttempt[] = [];
  let lastError: unknown;

  // Try configured/fallback models in order and return the first provider that
  // yields at least one image; failed attempts are preserved for diagnostics.
  for (const candidate of candidates) {
    const provider = getProvider(candidate.provider, params.cfg);
    if (!provider) {
      const error = `No image-generation provider registered for ${candidate.provider}`;
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error,
      });
      lastError = new Error(error);
      logger.warn(
        `image-generation candidate failed: ${candidate.provider}/${candidate.model}: ${error}`,
      );
      continue;
    }

    try {
      const timeoutMs = resolveMediaProviderRequestTimeoutMs({
        timeoutMs: requestedTimeoutMs,
        providerDefaultTimeoutMs: provider.defaultTimeoutMs,
      });
      const sanitized = resolveImageGenerationOverrides({
        provider,
        model: candidate.model,
        size: params.size,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        quality: params.quality,
        outputFormat: params.outputFormat,
        background: params.background,
        inputImages: params.inputImages,
      });
      // Providers receive only supported overrides. Ignored/normalized values
      // are returned to callers so user-facing replies can explain adjustments.
      const result: ImageGenerationResult = await provider.generateImage({
        provider: candidate.provider,
        model: candidate.model,
        prompt: params.prompt,
        cfg: params.cfg,
        agentDir: params.agentDir,
        authStore: params.authStore,
        count: params.count,
        size: sanitized.size,
        aspectRatio: sanitized.aspectRatio,
        resolution: sanitized.resolution,
        quality: sanitized.quality,
        outputFormat: sanitized.outputFormat,
        background: sanitized.background,
        inputImages: params.inputImages,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        providerOptions: params.providerOptions,
        ssrfPolicy: params.ssrfPolicy,
      });
      if (!Array.isArray(result.images) || result.images.length === 0) {
        throw new Error("Image generation provider returned no images.");
      }
      return {
        images: result.images,
        provider: candidate.provider,
        model: result.model ?? candidate.model,
        attempts,
        normalization: sanitized.normalization,
        metadata: {
          ...result.metadata,
          ...buildMediaGenerationNormalizationMetadata({
            normalization: sanitized.normalization,
            requestedSizeForDerivedAspectRatio: params.size,
          }),
        },
        ignoredOverrides: sanitized.ignoredOverrides,
      };
    } catch (err) {
      lastError = err;
      const described = isFailoverError(err) ? describeFailoverError(err) : undefined;
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error: described?.message ?? formatErrorMessage(err),
        reason: described?.reason,
        status: described?.status,
        code: described?.code,
      });
      logger.warn(
        `image-generation candidate failed: ${candidate.provider}/${candidate.model}: ${
          described?.message ?? formatErrorMessage(err)
        }`,
      );
    }
  }

  return throwCapabilityGenerationFailure({
    capabilityLabel: "image generation",
    attempts,
    lastError,
  });
}
