// Shared provider-facing HTTP helpers. Keep generic transport utilities here so
// capability SDKs do not depend on each other.

export {
  assertOkOrThrowHttpError,
  assertOkOrThrowProviderError,
  assertProviderBinaryResponseContent,
  createProviderHttpError,
  extractProviderErrorDetail,
  extractProviderRequestId,
  formatProviderErrorPayload,
  formatProviderHttpErrorMessage,
  readProviderBinaryResponse,
  readProviderJsonArrayFieldResponse,
  readProviderJsonObjectResponse,
  readProviderJsonResponse,
  readProviderTextResponse,
  readResponseTextLimited,
  truncateErrorDetail,
} from "../agents/provider-http-errors.ts";
export {
  buildAudioTranscriptionFormData,
  createProviderOperationDeadline,
  createProviderOperationTimeoutResolver,
  fetchProviderDownloadResponse,
  fetchProviderOperationResponse,
  fetchWithTimeout,
  fetchWithTimeoutGuarded,
  normalizeBaseUrl,
  pollProviderOperationJson,
  postJsonRequest,
  postMultipartRequest,
  postTranscriptionRequest,
  resolveProviderOperationTimeoutMs,
  resolveProviderHttpRequestConfig,
  resolveAudioTranscriptionUploadFileName,
  requireTranscriptionText,
  sanitizeConfiguredModelProviderRequest,
  waitProviderOperationPollInterval,
} from "../media-understanding/shared.ts";
export type {
  ProviderOperationDeadline,
  ProviderOperationTimeoutMs,
} from "../media-understanding/shared.ts";
export {
  executeProviderOperationWithRetry,
  providerOperationRetryConfig,
} from "../provider-runtime/operation-retry.ts";
export type {
  ProviderOperationRetryStage,
  TransientProviderRetryConfig,
  TransientProviderRetryOptions,
  TransientProviderRetryParams,
} from "../provider-runtime/operation-retry.ts";
export type {
  ProviderAttributionPolicy,
  ProviderRequestCapabilities,
  ProviderRequestCapabilitiesInput,
  ProviderRequestCompatibilityFamily,
  ProviderEndpointClass,
  ProviderEndpointResolution,
  ProviderRequestCapability,
  ProviderRequestPolicyInput,
  ProviderRequestPolicyResolution,
  ProviderRequestTransport,
} from "../agents/provider-attribution.ts";
export type {
  ProviderRequestAuthOverride,
  ProviderRequestProxyOverride,
  ProviderRequestTlsOverride,
  ProviderRequestTransportOverrides,
} from "../agents/provider-request-config.ts";
export { resolveProviderRequestHeaders } from "../agents/provider-request-config.ts";
export {
  resolveProviderEndpoint,
  resolveProviderRequestCapabilities,
  resolveProviderRequestPolicy,
} from "../agents/provider-attribution.ts";
