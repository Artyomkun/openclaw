// Shared speech-provider implementation helpers for bundled and third-party plugins.

export type { SpeechProviderPlugin } from "../plugins/types.ts";
export type { ResolvedTtsConfig, ResolvedTtsModelOverrides } from "../tts/tts-types.ts";
export type {
  SpeechDirectiveTokenParseContext,
  SpeechDirectiveTokenParseResult,
  SpeechListVoicesRequest,
  SpeechModelOverridePolicy,
  SpeechProviderConfig,
  SpeechProviderConfiguredContext,
  SpeechProviderPreparedSynthesis,
  SpeechProviderPrepareSynthesisContext,
  SpeechProviderResolveConfigContext,
  SpeechProviderResolveTalkConfigContext,
  SpeechProviderResolveTalkOverridesContext,
  SpeechProviderOverrides,
  SpeechSynthesisRequest,
  SpeechSynthesisStreamRequest,
  SpeechSynthesisStreamResult,
  SpeechSynthesisTarget,
  SpeechTelephonySynthesisRequest,
  SpeechVoiceOption,
  TtsDirectiveOverrides,
  TtsDirectiveParseResult,
} from "../tts/provider-types.ts";

export {
  scheduleCleanup,
  summarizeText,
  normalizeApplyTextNormalization,
  normalizeLanguageCode,
  normalizeSeed,
  requireInRange,
} from "../tts/tts-core.ts";
export { parseTtsDirectives } from "../tts/directives.ts";
export { parseSpeechDirectiveNumberOverride } from "../tts/directive-number.ts";
export {
  canonicalizeSpeechProviderId,
  getSpeechProvider,
  listLoadedSpeechProviders,
  listSpeechProviders,
  normalizeSpeechProviderId,
} from "../tts/provider-registry.ts";
export { resolveEffectiveTtsConfig } from "../tts/tts-config.ts";
export type { TtsConfigResolutionContext } from "../tts/tts-config.ts";
export { normalizeTtsAutoMode, TTS_AUTO_MODES } from "../tts/tts-auto-mode.ts";
export {
  asBoolean,
  asFiniteNumber,
  asObject,
  assertOkOrThrowProviderError,
  createProviderHttpError,
  extractProviderErrorDetail,
  extractProviderRequestId,
  formatProviderErrorPayload,
  formatProviderHttpErrorMessage,
  readResponseTextLimited,
  trimToUndefined,
  truncateErrorDetail,
} from "../agents/provider-http-errors.ts";
