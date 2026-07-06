// Public speech helpers for bundled or third-party plugins.
//
// Keep this surface provider-facing: types, validation, directive parsing, and
// registry helpers. Runtime synthesis lives on `api.runtime.tts` or narrower
// core/runtime seams, not here.

export type { SpeechProviderPlugin } from "../plugins/types.ts";
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

export { parseTtsDirectives } from "../tts/directives.ts";
export {
  canonicalizeSpeechProviderId,
  getSpeechProvider,
  listSpeechProviders,
  normalizeSpeechProviderId,
} from "../tts/provider-registry.ts";
export { normalizeTtsAutoMode, TTS_AUTO_MODES } from "../tts/tts-auto-mode.ts";
export {
  asBoolean,
  asFiniteNumber,
  asObject,
  assertOkOrThrowProviderError,
  createProviderHttpError,
  extractProviderErrorDetail,
  extractProviderRequestId,
  formatProviderHttpErrorMessage,
  formatProviderErrorPayload,
  readResponseTextLimited,
  trimToUndefined,
  truncateErrorDetail,
} from "../agents/provider-http-errors.ts";
export {
  normalizeApplyTextNormalization,
  normalizeLanguageCode,
  normalizeSeed,
  requireInRange,
  scheduleCleanup,
} from "../tts/tts-provider-helpers.ts";
export {
  createOpenAiCompatibleSpeechProvider,
  type OpenAiCompatibleSpeechProviderBaseUrlPolicy,
  type OpenAiCompatibleSpeechProviderConfig,
  type OpenAiCompatibleSpeechProviderExtraJsonBodyField,
  type OpenAiCompatibleSpeechProviderOptions,
} from "../tts/openai-compatible-speech-provider.ts";
