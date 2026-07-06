/**
 * Public SDK subpath for realtime voice provider types, runtime helpers, and talk events.
 */
export type { RealtimeVoiceProviderPlugin } from "../plugins/types.ts";
export type {
  RealtimeVoiceAudioFormat,
  RealtimeVoiceBargeInOptions,
  RealtimeVoiceBridge,
  RealtimeVoiceBridgeCallbacks,
  RealtimeVoiceBridgeEvent,
  RealtimeVoiceBrowserSession,
  RealtimeVoiceBrowserSessionCreateRequest,
  RealtimeVoiceBridgeCreateRequest,
  RealtimeVoiceProviderCapabilities,
  RealtimeVoiceCloseReason,
  RealtimeVoiceProviderConfig,
  RealtimeVoiceProviderConfiguredContext,
  RealtimeVoiceProviderId,
  RealtimeVoiceProviderResolveConfigContext,
  RealtimeVoiceRole,
  RealtimeVoiceTool,
  RealtimeVoiceToolCallEvent,
  RealtimeVoiceToolResultOptions,
} from "../talk/provider-types.ts";
export {
  REALTIME_VOICE_AUDIO_FORMAT_G711_ULAW_8KHZ,
  REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ,
} from "../talk/provider-types.ts";
export {
  createTalkEventSequencer,
  TALK_EVENT_TYPES,
  type TalkBrain,
  type TalkEvent,
  type TalkEventContext,
  type TalkEventInput,
  type TalkEventSequencer,
  type TalkEventType,
  type TalkMode,
  type TalkTransport,
} from "../talk/talk-events.ts";
export { createTalkDiagnosticEvent, recordTalkDiagnosticEvent } from "../talk/diagnostics.ts";
export { createTalkLogRecord, recordTalkLogEvent } from "../talk/logging.ts";
export { recordTalkObservabilityEvent } from "../talk/observability.ts";
export {
  createTalkSessionController,
  normalizeTalkTransport,
  type TalkEnsureTurnResult,
  type TalkSessionControllerOptions,
  type TalkSessionController,
  type TalkSessionControllerParams,
  type TalkTurnFailure,
  type TalkTurnFailureReason,
  type TalkTurnResult,
  type TalkTurnSuccess,
} from "../talk/talk-session-controller.ts";
export {
  REALTIME_VOICE_ACTIVATION_NAME_MAX_WORDS,
  isSupportedRealtimeVoiceActivationName,
  matchRealtimeVoiceActivationName,
  normalizeRealtimeVoiceActivationName,
  normalizeRealtimeVoiceActivationNamePrefix,
  normalizeSupportedRealtimeVoiceActivationName,
  realtimeVoiceActivationNameWordCount,
  sortRealtimeVoiceActivationNames,
  type RealtimeVoiceActivationNameEdge,
  type RealtimeVoiceActivationNameMatchKind,
  type RealtimeVoiceActivationNameTranscriptResult,
} from "../talk/activation-name.ts";
export {
  classifySkippableRealtimeVoiceConsultTranscript,
  type SkippableRealtimeVoiceConsultTranscriptReason,
} from "../talk/consult-transcript.ts";
export {
  matchRealtimeVoiceConsultQuestions,
  normalizeRealtimeVoiceConsultQuestion,
  readRealtimeVoiceConsultQuestion,
  readSpeakableRealtimeVoiceToolResult,
  type RealtimeVoiceConsultQuestionMatchOptions,
  type RealtimeVoiceSpeakableToolResultOptions,
} from "../talk/consult-question.ts";
export {
  createRealtimeVoiceForcedConsultCoordinator,
  type RealtimeVoiceForcedConsultCoordinator,
  type RealtimeVoiceForcedConsultCoordinatorOptions,
  type RealtimeVoiceForcedConsultHandle,
  type RealtimeVoiceForcedConsultNativeMatch,
  type RealtimeVoiceForcedConsultNativeRecentOptions,
  type RealtimeVoiceForcedConsultTimer,
} from "../talk/forced-consult-coordinator.ts";
export {
  createRealtimeVoiceTurnContextTracker,
  type RealtimeVoiceTurnContextHandle,
  type RealtimeVoiceTurnContextTracker,
  type RealtimeVoiceTurnContextTrackerOptions,
} from "../talk/turn-context-tracker.ts";
export {
  createRealtimeVoiceOutputActivityTracker,
  type RealtimeVoiceOutputActivityDelta,
  type RealtimeVoiceOutputActivitySnapshot,
  type RealtimeVoiceOutputActivityTracker,
  type RealtimeVoiceOutputActivityTrackerOptions,
} from "../talk/output-activity-tracker.ts";
export {
  buildRealtimeVoiceAgentConsultChatMessage,
  buildRealtimeVoiceAgentConsultPolicyInstructions,
  buildRealtimeVoiceAgentConsultPrompt,
  buildRealtimeVoiceAgentConsultWorkingResponse,
  collectRealtimeVoiceAgentConsultVisibleText,
  isRealtimeVoiceAgentConsultToolPolicy,
  parseRealtimeVoiceAgentConsultArgs,
  REALTIME_VOICE_AGENT_CONSULT_TOOL,
  REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
  REALTIME_VOICE_AGENT_CONSULT_TOOL_POLICIES,
  resolveRealtimeVoiceAgentConsultToolPolicy,
  resolveRealtimeVoiceAgentConsultTools,
  resolveRealtimeVoiceAgentConsultToolsAllow,
  type RealtimeVoiceAgentConsultArgs,
  type RealtimeVoiceAgentConsultToolPolicy,
  type RealtimeVoiceAgentConsultTranscriptEntry,
} from "../talk/agent-consult-tool.ts";
export {
  consultRealtimeVoiceAgent,
  type RealtimeVoiceAgentConsultResult,
  type RealtimeVoiceAgentConsultRuntime,
} from "../talk/agent-consult-runtime.ts";
export {
  createRealtimeVoiceAgentTalkbackQueue,
  type RealtimeVoiceAgentTalkbackQueue,
  type RealtimeVoiceAgentTalkbackQueueParams,
  type RealtimeVoiceAgentTalkbackResult,
} from "../talk/agent-talkback-runtime.ts";
export {
  buildRealtimeVoiceAgentCancelProviderResult,
  buildRealtimeVoiceAgentControlSpeechMessage,
  classifyRealtimeVoiceAgentControlText,
  controlRealtimeVoiceAgentRun,
  normalizeRealtimeVoiceAgentControlMode,
  parseRealtimeVoiceAgentControlToolArgs,
  REALTIME_VOICE_AGENT_CONTROL_MODES,
  REALTIME_VOICE_AGENT_CONTROL_TOOL,
  REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME,
  resolveRealtimeVoiceAgentControlIntent,
  shouldAutoControlRealtimeVoiceAgentText,
  type RealtimeVoiceAgentControlMode,
  type RealtimeVoiceAgentControlIntent,
  type RealtimeVoiceAgentControlProviderResult,
  type RealtimeVoiceAgentControlResult,
} from "../talk/agent-run-control.ts";
export {
  resolveRealtimeVoiceFastContextConsult,
  type RealtimeVoiceFastContextConfig,
  type RealtimeVoiceFastContextConsultResult,
  type RealtimeVoiceFastContextLabels,
} from "../talk/fast-context-runtime.ts";
export {
  canonicalizeRealtimeVoiceProviderId,
  getRealtimeVoiceProvider,
  listRealtimeVoiceProviders,
  normalizeRealtimeVoiceProviderId,
} from "../talk/provider-registry.ts";
export {
  resolveConfiguredRealtimeVoiceProvider,
  type ResolvedRealtimeVoiceProvider,
  type ResolveConfiguredRealtimeVoiceProviderParams,
} from "../talk/provider-resolver.ts";
export {
  createRealtimeVoiceBridgeSession,
  type RealtimeVoiceAudioSink,
  type RealtimeVoiceBridgeSession,
  type RealtimeVoiceBridgeSessionParams,
  type RealtimeVoiceMarkStrategy,
} from "../talk/session-runtime.ts";
export {
  extendRealtimeVoiceOutputEchoSuppression,
  getRealtimeVoiceBridgeEventHealth,
  getRealtimeVoiceTranscriptHealth,
  isLikelyRealtimeVoiceAssistantEchoTranscript,
  recordRealtimeVoiceBridgeEvent,
  recordRealtimeVoiceTranscript,
  type RealtimeVoiceBridgeEventHealth,
  type RealtimeVoiceBridgeEventLogEntry,
  type RealtimeVoiceTranscriptEntry,
  type RealtimeVoiceTranscriptHealth,
} from "../talk/session-log-runtime.ts";
export {
  convertPcmToMulaw8k,
  mulawToPcm,
  pcmToMulaw,
  resamplePcm,
  resamplePcmTo8k,
} from "../talk/audio-codec.ts";
