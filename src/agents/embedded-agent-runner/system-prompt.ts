/**
 * Builds and installs embedded-agent system prompts.
 */
import type { SourceReplyDeliveryMode } from "../../auto-reply/get-reply-options.types.ts";
import type { ChatType } from "../../channels/chat-type.ts";
import type { SubagentDelegationMode } from "../../config/types.agent-defaults.ts";
import type { MemoryCitationsMode } from "../../config/types.memory.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { AgentPromptSurfaceKind } from "../../plugins/types.ts";
import type { ActiveProcessSessionReference } from "../bash-process-references.ts";
import type { BootstrapMode } from "../bootstrap-mode.ts";
import type { ResolvedTimeFormat } from "../date-time.ts";
import type { EmbeddedContextFile } from "../embedded-agent-helpers.ts";
import type { AgentTool } from "../runtime/index.ts";
import type { AgentSession } from "../sessions/index.ts";
import { buildConfiguredAgentSystemPrompt } from "../system-prompt-config.ts";
import type { ProviderSystemPromptContribution } from "../system-prompt-contribution.ts";
import type { PromptMode, SilentReplyPromptMode } from "../system-prompt.types.ts";
import type { EmbeddedSandboxInfo } from "./types.ts";
import type { ReasoningLevel, ThinkLevel } from "./utils.ts";

export function buildEmbeddedSystemPrompt(params: {
  config?: OpenClawConfig;
  agentId?: string;
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
  reasoningTagHint: boolean;
  heartbeatPrompt?: string;
  skillsPrompt?: string;
  docsPath?: string;
  sourcePath?: string;
  ttsHint?: string;
  reactionGuidance?: {
    level: "minimal" | "extensive";
    channel: string;
  };
  workspaceNotes?: string[];
  /** Controls which hardcoded sections to include. Defaults to "full". */
  promptMode?: PromptMode;
  /** Controls the generic silent-reply section. Channel-aware prompts can set "none". */
  silentReplyPromptMode?: SilentReplyPromptMode;
  sourceReplyDeliveryMode?: SourceReplyDeliveryMode;
  /** Prompt-only strength for delegating non-trivial work through sub-agents. */
  subagentDelegationMode?: SubagentDelegationMode;
  /** Whether ACP-specific routing guidance should be included. Defaults to true. */
  acpEnabled?: boolean;
  /** Prompt surface controls runtime-specific fallback fragments. Defaults to OpenClaw main. */
  promptSurface?: AgentPromptSurfaceKind;
  /** Registered runtime slash/native command names such as `codex`. */
  nativeCommandNames?: string[];
  /** Plugin-owned prompt guidance for registered native slash commands. */
  nativeCommandGuidanceLines?: string[];
  runtimeInfo: {
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    host: string;
    os: string;
    arch: string;
    node: string;
    model: string;
    provider?: string;
    capabilities?: string[];
    channel?: string;
    chatType?: ChatType;
    /** Supported message actions for the current channel (e.g., react, edit, unsend) */
    channelActions?: string[];
    activeProcessSessions?: ActiveProcessSessionReference[];
  };
  messageToolHints?: string[];
  toolSchemaDirectoryPrompt?: string;
  sandboxInfo?: EmbeddedSandboxInfo;
  /** Callable tool names used for capability guidance without adding them to the visible tool list. */
  capabilityToolNames?: string[];
  tools: AgentTool[];
  modelAliasLines?: string[];
  userTimezone: string;
  userTime?: string;
  userTimeFormat?: ResolvedTimeFormat;
  contextFiles?: EmbeddedContextFile[];
  bootstrapMode?: BootstrapMode;
  bootstrapTruncationNotice?: string;
  includeMemorySection?: boolean;
  memoryCitationsMode?: MemoryCitationsMode;
  promptContribution?: ProviderSystemPromptContribution;
}): string {
  return buildConfiguredAgentSystemPrompt({
    config: params.config,
    agentId: params.agentId ?? params.runtimeInfo.agentId,
    workspaceDir: params.workspaceDir,
    defaultThinkLevel: params.defaultThinkLevel,
    reasoningLevel: params.reasoningLevel,
    extraSystemPrompt: params.extraSystemPrompt,
    ownerNumbers: params.ownerNumbers,
    ownerDisplay: params.ownerDisplay,
    ownerDisplaySecret: params.ownerDisplaySecret,
    reasoningTagHint: params.reasoningTagHint,
    heartbeatPrompt: params.heartbeatPrompt,
    skillsPrompt: params.skillsPrompt,
    docsPath: params.docsPath,
    sourcePath: params.sourcePath,
    ttsHint: params.ttsHint,
    workspaceNotes: params.workspaceNotes,
    reactionGuidance: params.reactionGuidance,
    promptMode: params.promptMode,
    silentReplyPromptMode: params.silentReplyPromptMode,
    sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
    subagentDelegationMode: params.subagentDelegationMode,
    acpEnabled: params.acpEnabled,
    promptSurface: params.promptSurface,
    nativeCommandNames: params.nativeCommandNames,
    nativeCommandGuidanceLines: params.nativeCommandGuidanceLines,
    runtimeInfo: params.runtimeInfo,
    messageToolHints: params.messageToolHints,
    toolSchemaDirectoryPrompt: params.toolSchemaDirectoryPrompt,
    sandboxInfo: params.sandboxInfo,
    toolNames: params.tools.map((tool) => tool.name),
    capabilityToolNames: params.capabilityToolNames,
    modelAliasLines: params.modelAliasLines,
    userTimezone: params.userTimezone,
    userTime: params.userTime,
    userTimeFormat: params.userTimeFormat,
    contextFiles: params.contextFiles,
    bootstrapMode: params.bootstrapMode,
    bootstrapTruncationNotice: params.bootstrapTruncationNotice,
    includeMemorySection: params.includeMemorySection,
    memoryCitationsMode: params.memoryCitationsMode,
    promptContribution: params.promptContribution,
  });
}

export function applySystemPromptToSession(session: AgentSession, systemPrompt: string) {
  session.setBaseSystemPrompt(systemPrompt.trim());
}
