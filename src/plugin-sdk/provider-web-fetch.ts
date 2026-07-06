// Public web-fetch registration helpers for provider plugins.

import type {
  WebFetchCredentialResolutionSource,
  WebFetchProviderPlugin,
  WebFetchProviderToolDefinition,
} from "../plugins/types.ts";
export { jsonResult, readNumberParam, readStringParam } from "../agents/tools/common.ts";
export {
  withSelfHostedWebToolsEndpoint,
  withStrictWebToolsEndpoint,
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
export { wrapExternalContent, wrapWebContent } from "../security/external-content.ts";
export type {
  WebFetchCredentialResolutionSource,
  WebFetchProviderPlugin,
  WebFetchProviderToolDefinition,
};
