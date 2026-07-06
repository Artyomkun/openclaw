// Shared root plugin-sdk surface.
// Keep this entry intentionally tiny. Channel/provider helpers belong on
// dedicated subpaths or, the compat surface.

export type {
  ChannelAccountSnapshot,
  ChannelAgentTool,
  ChannelAgentToolFactory,
  ChannelCapabilities,
  ChannelId,
  ChannelMessageActionAdapter,
  ChannelMessageActionContext,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "../channels/plugins/types.public.ts";
export type { ChannelGatewayContext } from "../channels/plugins/types.adapters.ts";
export type { ChannelConfigSchema, ChannelConfigUiHint } from "../channels/plugins/types.config.ts";
export type { ChannelSetupInput } from "../channels/plugins/types.public.ts";
export type { ChannelSetupAdapter } from "../channels/plugins/types.adapters.ts";
export type {
  ChannelConfiguredBindingConversationRef,
  ChannelConfiguredBindingMatch,
  ChannelConfiguredBindingProvider,
} from "../channels/plugins/types.adapters.ts";
export type { ChannelPlugin } from "../channels/plugins/types.plugin.ts";
export type {
  ConfiguredBindingConversation,
  ConfiguredBindingResolution,
  CompiledConfiguredBinding,
  StatefulBindingTargetDescriptor,
} from "../channels/plugins/binding-types.ts";
export type {
  StatefulBindingTargetDriver,
  StatefulBindingTargetReadyResult,
  StatefulBindingTargetResetResult,
  StatefulBindingTargetSessionResult,
} from "../channels/plugins/stateful-target-drivers.ts";
export type {
  ChannelSetupWizard,
  ChannelSetupWizardAllowFromEntry,
} from "../channels/plugins/setup-wizard-types.ts";
export type {
  AgentHarness,
  AnyAgentTool,
  CliBackendPlugin,
  MediaUnderstandingProviderPlugin,
  OpenClawPluginApi,
  OpenClawPluginConfigSchema,
  PluginLogger,
  ProviderAuthContext,
  ProviderAuthResult,
  ProviderPreparedRuntimeAuth,
  RealtimeTranscriptionProviderPlugin,
  SpeechProviderPlugin,
  UnifiedModelCatalogProviderContext,
  UnifiedModelCatalogProviderPlugin,
} from "../plugins/types.ts";
export type {
  PluginHookChannelChatContext,
  PluginHookChannelContext,
  PluginHookChannelSenderContext,
} from "../plugins/types.ts";
export type {
  UnifiedModelCatalogEntry,
  UnifiedModelCatalogKind,
  UnifiedModelCatalogSource,
} from "@openclaw/model-catalog-core/model-catalog-types";
export type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.ts";
export type { ResolvedProviderRuntimeAuth } from "../plugins/runtime/model-auth-types.ts";
export type {
  PluginRuntime,
  RuntimeLogger,
  SubagentRunParams,
  SubagentRunResult,
} from "../plugins/runtime/types.ts";
export type {
  LlmCompleteCaller,
  LlmCompleteMessage,
  LlmCompleteParams,
  LlmCompleteResult,
  LlmCompleteUsage,
} from "../plugins/runtime/types-core.ts";
export type {
  BoundTaskFlowsRuntime,
  BoundTaskRunsRuntime,
  DetachedTaskLifecycleRuntime,
  PluginRuntimeTaskFlows,
  PluginRuntimeTaskRuns,
  PluginRuntimeTasks,
} from "../plugins/runtime/runtime-tasks.types.ts";
export type {
  TaskFlowDetail,
  TaskFlowView,
  TaskRunAggregateSummary,
  TaskRunCancelResult,
  TaskRunDetail,
  TaskRunView,
} from "../plugins/runtime/task-domain-types.ts";
export type { OpenClawConfig } from "../config/config.ts";
export type {
  MemoryPluginCapability,
  MemoryPluginPublicArtifact,
  MemoryPluginPublicArtifactsProvider,
} from "../plugins/memory-state.ts";
export type { CliBackendConfig } from "../config/types.ts";
export type * from "./image-generation.ts";
export type * from "./music-generation.ts";
export type { SecretInput, SecretRef } from "../config/types.secrets.ts";
export type { RuntimeEnv } from "../runtime.ts";
export type { HookEntry } from "../hooks/types.ts";
export type { ReplyPayload } from "./reply-payload.ts";
export type { WizardPrompter } from "../wizard/prompts.ts";
export type {
  ContextEngineFactory,
  ContextEngineFactoryContext,
} from "../context-engine/registry.ts";
export type { DiagnosticEventPayload } from "../infra/diagnostic-events.ts";
export type { DiagnosticTraceContext } from "../infra/diagnostic-trace-context.ts";
export type {
  AssembleResult,
  BootstrapResult,
  CompactResult,
  ContextEngine,
  ContextEngineHostCapability,
  ContextEngineHostRequirements,
  ContextEngineInfo,
  ContextEngineMaintenanceResult,
  ContextEngineOperation,
  ContextEngineRuntimeReasonCode,
  ContextEngineRuntimeContext,
  ContextEngineRuntimeMode,
  ContextEngineRuntimeSettings,
  ContextEngineSelectionSource,
  IngestBatchResult,
  IngestResult,
  SubagentEndReason,
  SubagentSpawnPreparation,
  TranscriptRewriteReplacement,
  TranscriptRewriteRequest,
  TranscriptRewriteResult,
} from "../context-engine/types.ts";

export { emptyPluginConfigSchema } from "../plugins/config-schema.ts";
export { registerContextEngine } from "../context-engine/registry.ts";
export {
  ContextEngineRuntimeSettingsUnavailableError,
  ContextEngineRuntimeSettingsUnsupportedError,
} from "../context-engine/types.ts";
export { assertContextEngineHostSupport } from "../context-engine/host-compat.ts";
export {
  buildMemorySystemPromptAddition,
  delegateCompactionToRuntime,
} from "../context-engine/delegate.ts";
export { onDiagnosticEvent } from "../infra/diagnostic-events.ts";
export { optionalStringEnum, stringEnum } from "../agents/schema/typebox.ts";
