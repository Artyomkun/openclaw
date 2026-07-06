// Provider model helpers normalize model catalog entries shared by provider plugins.
import { normalizeProviderId as normalizeProviderIdCore } from "@openclaw/model-catalog-core/provider-id";
import {
  normalizeAntigravityPreviewModelId as normalizeAntigravityPreviewModelIdCore,
  normalizeGooglePreviewModelId as normalizeGooglePreviewModelIdCore,
} from "@openclaw/model-catalog-core/provider-model-id-normalize";
import type { ProviderPlugin } from "../plugins/types.ts";
import type {
  ProviderReasoningOutputModeContext,
  ProviderReplayPolicyContext,
  ProviderSanitizeReplayHistoryContext,
} from "./plugin-entry.ts";

export type {
  ModelApi,
  ModelProviderDeclarationConfig as ModelProviderConfig,
} from "../config/types.models.ts";
export {
  resolveClaudeFable5ModelIdentity,
  resolveClaudeModelIdentity,
  resolveClaudeNativeThinkingLevelMap,
  supportsClaudeAdaptiveThinking,
  supportsClaudeNativeMaxEffort,
  supportsClaudeNativeXhighEffort,
} from "@openclaw/llm-core";
export type {
  UnifiedModelCatalogEntry,
  UnifiedModelCatalogKind,
  UnifiedModelCatalogSource,
} from "@openclaw/model-catalog-core/model-catalog-types";
export type {
  BedrockDiscoveryConfig,
  ModelCompatConfig,
  ModelDefinitionConfig,
} from "../config/types.models.ts";
export type {
  ProviderEndpointClass,
  ProviderEndpointResolution,
} from "../agents/provider-attribution.ts";
export type {
  ProviderPlugin,
  UnifiedModelCatalogProviderContext,
  UnifiedModelCatalogProviderPlugin,
} from "../plugins/types.ts";

export { DEFAULT_CONTEXT_TOKENS } from "../agents/defaults.ts";
export { resolveProviderEndpoint } from "../agents/provider-attribution.ts";
export {
  applyModelCompatPatch,
  hasToolSchemaProfile,
  hasNativeWebSearchTool,
  normalizeModelCompat,
  resolveUnsupportedToolSchemaKeywords,
  resolveToolCallArgumentsEncoding,
} from "../plugins/provider-model-compat.ts";

/**
 * Normalizes provider ids for config, catalog, and plugin-registry matching.
 */
export function normalizeProviderId(
  /** Provider id from config, catalog, or plugin metadata. */
  provider: string,
): string {
  return normalizeProviderIdCore(provider);
}
export {
  cloneFirstTemplateModel,
  matchesExactOrPrefix,
} from "../plugins/provider-model-helpers.ts";

export {
  isClaudeAdaptiveThinkingDefaultModelId,
  resolveClaudeThinkingProfile,
} from "../plugins/provider-claude-thinking.ts";

/**
 * Normalizes Antigravity preview model ids to the canonical provider catalog form.
 */
export function normalizeAntigravityPreviewModelId(
  /** Antigravity preview model id from config or catalog data. */
  id: string,
): string {
  return normalizeAntigravityPreviewModelIdCore(id);
}

/**
 * Normalizes Google preview model ids to the canonical provider catalog form.
 */
export function normalizeGooglePreviewModelId(
  /** Google preview model id from config or catalog data. */
  id: string,
): string {
  return normalizeGooglePreviewModelIdCore(id);
}

/**
 * Shared replay-policy families reused by provider plugins with matching transcript semantics.
 */
export type ProviderReplayFamily =
  | "openai-compatible"
  | "anthropic-by-model"
  | "native-anthropic-by-model"
  | "google-gemini"
  | "passthrough-gemini"
  | "hybrid-anthropic-openai";

type ProviderReplayFamilyHooks = Pick<
  ProviderPlugin,
  "buildReplayPolicy" | "sanitizeReplayHistory" | "resolveReasoningOutputMode"
>;

type BuildProviderReplayFamilyHooksOptions =
  | {
      /** OpenAI-compatible transcript family using OpenAI-style tool calls. */
      family: "openai-compatible";
      /** Whether replay policy should rewrite tool call ids for provider compatibility. */
      sanitizeToolCallIds?: boolean;
      /** Optional output style for repeated tool call ids. */
      duplicateToolCallIdStyle?: "openai";
      /** Whether replay policy should strip reasoning blocks from history. */
      dropReasoningFromHistory?: boolean;
    }
  | {
      /** Anthropic-style transcript policy selected by Claude model id. */
      family: "anthropic-by-model";
    }
  | {
      /** Native Anthropic transcript policy preserving Anthropic ids/signatures. */
      family: "native-anthropic-by-model";
    }
  | {
      /** Google Gemini transcript policy with Gemini replay sanitation hooks. */
      family: "google-gemini";
    }
  | {
      /** OpenAI-compatible transport carrying Gemini-style thought signatures. */
      family: "passthrough-gemini";
    }
  | {
      /** Family that switches between Anthropic and OpenAI-compatible replay by request context. */
      family: "hybrid-anthropic-openai";
      /** Whether Anthropic-model replay should drop thinking blocks in hybrid mode. */
      anthropicModelDropThinkingBlocks?: boolean;
    };

/**
 * Builds provider replay hooks for a known transcript/reasoning compatibility family.
 */
export function buildProviderReplayFamilyHooks(): ProviderReplayFamilyHooks {
  throw new Error("Unsupported provider replay family");
}
