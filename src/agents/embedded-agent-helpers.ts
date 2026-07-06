/** Embedded-agent helper barrel for bootstrap, provider error, media, and turn sanitizers. */
export { isModelNotFoundErrorMessage } from "./live-model-errors.ts";

export {
  buildBootstrapContextFiles,
  DEFAULT_BOOTSTRAP_MAX_CHARS,
  DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE,
  DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS,
  ensureSessionHeader,
  resolveBootstrapMaxChars,
  resolveBootstrapPromptTruncationWarningMode,
  resolveBootstrapTotalMaxChars,
  stripThoughtSignatures,
} from "./embedded-agent-helpers/bootstrap.ts";
export {
  BILLING_ERROR_USER_MESSAGE,
  classifyAssistantFailoverReason,
  classifyProviderRuntimeFailureKind,
  formatBillingErrorMessage,
  formatRateLimitOrOverloadedErrorCopy,
  classifyFailoverReason,
  classifyFailoverReasonFromHttpStatus,
  formatRawAssistantErrorForUi,
  formatAssistantErrorText,
  formatUserFacingAssistantErrorText,
  GENERIC_ASSISTANT_ERROR_TEXT,
  getApiErrorPayloadFingerprint,
  isAuthAssistantError,
  isAuthErrorMessage,
  isAuthPermanentErrorMessage,
  isBillingAssistantError,
  extractObservedOverflowTokenCount,
  parseApiErrorInfo,
  isBillingErrorMessage,
  isCloudflareOrHtmlErrorPage,
  isCloudCodeAssistFormatError,
  isCompactionFailureError,
  isContextOverflowError,
  isLikelyContextOverflowError,
  isFailoverAssistantError,
  isFailoverErrorMessage,
  isGenericUnknownStreamErrorMessage,
  isImageDimensionErrorMessage,
  isImageSizeError,
  isOverloadedErrorMessage,
  isRawApiErrorPayload,
  isRateLimitAssistantError,
  isRateLimitErrorMessage,
  isTransientHttpError,
  isTimeoutErrorMessage,
  parseImageDimensionError,
  parseImageSizeError,
} from "./embedded-agent-helpers/errors.ts";
export type { ProviderRuntimeFailureKind } from "./embedded-agent-helpers/errors.ts";
export { sanitizeUserFacingText } from "./embedded-agent-helpers/sanitize-user-facing-text.ts";
export { isGoogleModelApi, sanitizeGoogleTurnOrdering } from "./embedded-agent-helpers/google.ts";

export {
  downgradeOpenAIFunctionCallReasoningPairs,
  downgradeOpenAIReasoningBlocks,
  normalizeOpenAIResponsesToolCallIds,
} from "./embedded-agent-helpers/openai.ts";
export { sanitizeSessionMessagesImages } from "./embedded-agent-helpers/images.ts";
export {
  isMessagingToolDuplicate,
  isMessagingToolDuplicateNormalized,
  normalizeTextForComparison,
} from "./embedded-agent-helpers/messaging-dedupe.ts";

export { pickFallbackThinkingLevel } from "./embedded-agent-helpers/thinking.ts";

export {
  mergeConsecutiveUserTurns,
  validateAnthropicTurns,
  validateGeminiTurns,
} from "./embedded-agent-helpers/turns.ts";
export type { EmbeddedContextFile, FailoverReason } from "./embedded-agent-helpers/types.ts";

export type { ToolCallIdMode } from "./tool-call-id.ts";
export { isValidCloudCodeAssistToolId, sanitizeToolCallId } from "./tool-call-id.ts";
