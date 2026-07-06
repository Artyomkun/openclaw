/** Shared helpers for model commands that read or mutate model config. */
import { resolveAgentDir, resolveDefaultAgentId, listAgentIds } from "../../agents/agent-scope.ts";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.ts";
import {
  buildModelAliasIndex,
  modelKey,
  resolveModelRefFromString,
} from "../../agents/model-selection.ts";
import { formatCliCommand } from "../../cli/command-format.ts";
import {
  type OpenClawConfig,
  readConfigFileSnapshot,
  replaceConfigFile,
} from "../../config/config.ts";
import { formatConfigIssueLines } from "../../config/issue-format.ts";
import { normalizeAgentModelRefForConfig, toAgentModelListLike } from "../../config/model-input.ts";
import type { AgentModelEntryConfig } from "../../config/types.agent-defaults.ts";
import type { AgentModelConfig } from "../../config/types.agents-shared.ts";
import { normalizeAgentId } from "../../routing/session-key.ts";
import { canonicalizeModelCatalogProviderRef } from "./provider-aliases.ts";

export const ensureFlagCompatibility = (opts: { json?: boolean; plain?: boolean }) => {
  if (opts.json && opts.plain) {
    throw new Error("Choose either --json or --plain, not both.");
  }
};

/** Formats token counts as compact K-suffixed labels. */
export const formatTokenK = (value?: number | null) => {
  if (!value || !Number.isFinite(value)) {
    return "-";
  }
  if (value < 1024) {
    return `${Math.round(value)}`;
  }
  return `${Math.round(value / 1024)}k`;
};

/** Formats millisecond durations for model command output. */
export const formatMs = (value?: number | null) => {
  if (value === null || value === undefined) {
    return "-";
  }
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${Math.round(value / 100) / 10}s`;
};

/** Loads config from disk and throws a formatted error when validation fails. */
export async function loadValidConfigOrThrow(): Promise<OpenClawConfig> {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid) {
    const issues = formatConfigIssueLines(snapshot.issues, "-").join("\n");
    throw new Error(`Invalid config at ${snapshot.path}\n${issues}`);
  }
  return snapshot.runtimeConfig ?? snapshot.config;
}

/** Runtime config snapshot supplied to model config mutators. */
export type UpdateConfigContext = {
  runtimeConfig: OpenClawConfig;
};

/** Reads source config, applies a mutator, and writes only the source-form config. */
export async function updateConfig(
  mutator: (cfg: OpenClawConfig, context: UpdateConfigContext) => OpenClawConfig,
): Promise<OpenClawConfig> {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid) {
    const issues = formatConfigIssueLines(snapshot.issues, "-").join("\n");
    throw new Error(`Invalid config at ${snapshot.path}\n${issues}`);
  }
  const sourceConfig = structuredClone(snapshot.sourceConfig ?? snapshot.config);
  const runtimeConfig = structuredClone(snapshot.runtimeConfig ?? snapshot.config);
  // Mutate source config so SecretRefs and unresolved placeholders do not get
  // overwritten by runtime-resolved secret values.
  const next = mutator(sourceConfig, { runtimeConfig });
  await replaceConfigFile({
    nextConfig: next,
    baseHash: snapshot.hash,
  });
  return next;
}

/** Resolves a CLI model reference through aliases and catalog provider aliases. */
export function resolveModelTarget(params: { raw: string; cfg: OpenClawConfig }): {
  provider: string;
  model: string;
} {
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
  });
  const resolved = resolveModelRefFromString({
    raw: params.raw,
    defaultProvider: DEFAULT_PROVIDER,
    aliasIndex,
  });
  if (!resolved) {
    throw new Error(`Invalid model reference: ${params.raw}`);
  }
  return canonicalizeModelCatalogProviderRef(resolved.ref, { cfg: params.cfg });
}

/** Resolves model reference strings to canonical provider/model keys. */
export function resolveModelKeysFromEntries(params: {
  cfg: OpenClawConfig;
  entries: readonly string[];
}): string[] {
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
  });
  return params.entries
    .map((entry) =>
      resolveModelRefFromString({
        raw: entry,
        defaultProvider: DEFAULT_PROVIDER,
        aliasIndex,
      }),
    )
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => modelKey(entry.ref.provider, entry.ref.model));
}

/** Validates an optional agent id against configured agents. */
export function resolveKnownAgentId(params: {
  cfg: OpenClawConfig;
  rawAgentId?: string | null;
}): string | undefined {
  const raw = params.rawAgentId?.trim();
  if (!raw) {
    return undefined;
  }
  const agentId = normalizeAgentId(raw);
  const knownAgents = listAgentIds(params.cfg);
  if (!knownAgents.includes(agentId)) {
    throw new Error(
      `Unknown agent id "${raw}". Use "${formatCliCommand("openclaw agents list")}" to see configured agents.`,
    );
  }
  return agentId;
}

/** Resolves the selected model-command agent and its profile directory. */
export function resolveModelsTargetAgent(
  cfg: OpenClawConfig,
  rawAgentId?: string,
): {
  agentId: string;
  agentDir: string;
} {
  const agentId = resolveKnownAgentId({ cfg, rawAgentId }) ?? resolveDefaultAgentId(cfg);
  const agentDir = resolveAgentDir(cfg, agentId);
  return { agentId, agentDir };
}

/** Normalized primary/fallback config shape used by text and image defaults. */
export type PrimaryFallbackConfig = { primary?: string; fallbacks?: string[] };

/** Merges primary/fallback patches while normalizing refs for config storage. */
export function mergePrimaryFallbackConfig(
  existing: PrimaryFallbackConfig | undefined,
  patch: { primary?: string; fallbacks?: string[] },
): PrimaryFallbackConfig {
  const base = existing && typeof existing === "object" ? existing : undefined;
  const next: PrimaryFallbackConfig = { ...base };
  if (patch.primary !== undefined) {
    next.primary = normalizeAgentModelRefForConfig(patch.primary);
  }
  if (patch.fallbacks !== undefined) {
    next.fallbacks = patch.fallbacks.map((fallback) => normalizeAgentModelRefForConfig(fallback));
  } else if (next.fallbacks !== undefined) {
    next.fallbacks = next.fallbacks.map((fallback) => normalizeAgentModelRefForConfig(fallback));
  }
  return next;
}

/** Applies a default text/image primary-model update and ensures the model entry exists. */
export function applyDefaultModelPrimaryUpdate(params: {
  cfg: OpenClawConfig;
  resolveCfg?: OpenClawConfig;
  modelRaw: string;
  field: "model" | "imageModel";
}): OpenClawConfig {
  const nextModels = {
    ...params.cfg.agents?.defaults?.models,
  } as Record<string, AgentModelEntryConfig>;

  const defaults = params.cfg.agents?.defaults ?? {};
  const existing = toAgentModelListLike(
    (defaults as Record<string, unknown>)[params.field] as AgentModelConfig | undefined,
  );

  return {
    ...params.cfg,
    agents: {
      ...params.cfg.agents,
      defaults: {
        ...defaults,
        [params.field]: mergePrimaryFallbackConfig(existing),
        models: nextModels,
      },
    },
  };
}

export { modelKey };
export { DEFAULT_MODEL, DEFAULT_PROVIDER };

/**
 * Model key format: "provider/model"
 *
 * The model key is displayed in `/model status` and used to reference models.
 * When using `/model <key>`, use the exact format shown (e.g., "openrouter/moonshotai/kimi-k2").
 *
 * For providers with hierarchical model IDs (e.g., OpenRouter), the model ID may include
 * sub-providers (e.g., "moonshotai/kimi-k2"), resulting in a key like "openrouter/moonshotai/kimi-k2".
 */
