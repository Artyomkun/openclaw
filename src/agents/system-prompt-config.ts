/**
 * Config-aware system prompt builder.
 *
 * This module gathers agent/config knobs before rendering the canonical system
 * prompt so callers do not duplicate owner, TTS, alias, memory, or FS policy.
 */
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { buildTtsSystemPromptHint } from "../tts/tts.ts";
import { resolveAgentConfig } from "./agent-scope.ts";
import { buildModelAliasLines } from "./model-alias-lines.ts";
import { resolveOwnerDisplaySetting } from "./owner-display.ts";
import { buildAgentSystemPrompt } from "./system-prompt.ts";
import { resolveEffectiveToolFsWorkspaceOnly } from "./tool-fs-policy.ts";

type AgentSystemPromptRenderParams = Parameters<typeof buildAgentSystemPrompt>[0];

/** Config-derived system prompt fields passed into the prompt renderer. */
type ResolvedAgentSystemPromptConfig = Pick<
  AgentSystemPromptRenderParams,
  | "ownerDisplay"
  | "ownerDisplaySecret"
  | "subagentDelegationMode"
  | "ttsHint"
  | "modelAliasLines"
  | "memoryCitationsMode"
  | "fsWorkspaceOnly"
>;

type ConfiguredAgentSystemPromptParams = AgentSystemPromptRenderParams & {
  config?: OpenClawConfig;
  agentId?: string;
};

/** Resolves all config-derived system prompt fields for an agent. */
export function resolveAgentSystemPromptConfig(params: {
  config?: OpenClawConfig;
  agentId?: string;
}): ResolvedAgentSystemPromptConfig {
  const { config, agentId } = params;
  const ownerDisplay = resolveOwnerDisplaySetting(config);
  const agentSubagents =
    config && agentId ? resolveAgentConfig(config, agentId)?.subagents : undefined;
  return {
    ownerDisplay: ownerDisplay.ownerDisplay,
    ownerDisplaySecret: ownerDisplay.ownerDisplaySecret,
    subagentDelegationMode:
      agentSubagents?.delegationMode ??
      config?.agents?.defaults?.subagents?.delegationMode ??
      "suggest",
    ttsHint: config ? buildTtsSystemPromptHint(config, agentId) : undefined,
    modelAliasLines: buildModelAliasLines(config),
    memoryCitationsMode: config?.memory?.citations,
    fsWorkspaceOnly: resolveEffectiveToolFsWorkspaceOnly({ cfg: config, agentId }),
  };
}

/** Builds the agent system prompt after applying config-derived prompt fields. */
export function buildConfiguredAgentSystemPrompt(params: ConfiguredAgentSystemPromptParams) {
  const { config, agentId, ...renderParams } = params;
  const configParams = config ? resolveAgentSystemPromptConfig({ config, agentId }) : {};
  return buildAgentSystemPrompt({
    ...renderParams,
    ...configParams,
  });
}
