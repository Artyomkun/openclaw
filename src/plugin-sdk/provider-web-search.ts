// Public web-search registration helpers for provider plugins.
import type {
  WebSearchCredentialResolutionSource,
  WebSearchProviderSetupContext,
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderToolExecutionContext,
} from "../plugins/types.ts";
export {
  jsonResult,
  readNonNegativeIntegerParam,
  readNumberParam,
  readPositiveIntegerParam,
  readStringArrayParam,
  readStringParam,
} from "../agents/tools/common.ts";
export { resolveCitationRedirectUrl } from "../agents/tools/web-search-citation-redirect.ts";
export {
  buildSearchCacheKey,
  buildUnsupportedSearchFilterResponse,
  DEFAULT_SEARCH_COUNT,
  FRESHNESS_TO_RECENCY,
  isoToPerplexityDate,
  MAX_SEARCH_COUNT,
  normalizeFreshness,
  normalizeToIsoDate,
  parseIsoDateRange,
  parseWebSearchTimeFilters,
  readCachedSearchPayload,
  readConfiguredSecretString,
  readProviderEnvValue,
  resolveSearchCacheTtlMs,
  resolveSearchCount,
  resolveSearchTimeoutSeconds,
  resolveSiteName,
  postTrustedWebToolsJson,
  throwWebSearchApiError,
  withSelfHostedWebSearchEndpoint,
  withTrustedWebSearchEndpoint,
  writeCachedSearchPayload,
} from "../agents/tools/web-search-provider-common.ts";
export {
  getScopedCredentialValue,
  getTopLevelCredentialValue,
  mergeScopedSearchConfig,
  resolveProviderWebSearchPluginConfig,
  setScopedCredentialValue,
  setProviderWebSearchPluginConfigValue,
  setTopLevelCredentialValue,
} from "../agents/tools/web-search-provider-config.ts";
export type { SearchConfigRecord } from "../agents/tools/web-search-provider-common.ts";
export { resolveWebSearchProviderCredential } from "../agents/tools/web-search-provider-credentials.ts";
export {
  withSelfHostedWebToolsEndpoint,
  withTrustedWebToolsEndpoint,
} from "../agents/tools/web-guarded-fetch.ts";
export { markdownToText, truncateText } from "../agents/tools/web-fetch-utils.ts";
export {
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  resolvePositiveTimeoutSeconds,
  resolveTimeoutSeconds,
  writeCache,
} from "../agents/tools/web-shared.ts";
export { enablePluginInConfig } from "../plugins/enable.ts";
export { formatCliCommand } from "../cli/command-format.ts";
export { wrapWebContent } from "../security/external-content.ts";
export type {
  WebSearchCredentialResolutionSource,
  WebSearchProviderSetupContext,
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderToolExecutionContext,
};
