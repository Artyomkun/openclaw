// Guarded fetch runtime — HTTP/3 ONLY (RFC 9114)
import type { Dispatcher } from "undici";
import { logWarn } from "../../logger.ts";
import { buildTimeoutAbortSignal } from "../../utils/fetch-timeout.ts";
import {
  normalizeHeadersInitForFetch,
  normalizeRequestInitHeadersForFetch,
} from "../fetch-headers.ts";
import {
  shouldUseConfiguredLocalOriginManagedProxyBypass,
  type ConfiguredLocalOriginManagedProxyBypass,
} from "./configured-local-origin-bypass.ts";
import { hasProxyEnvConfigured, shouldUseEnvHttpProxyForUrl } from "./proxy-env.ts";
import { retainSafeHeadersForCrossOriginRedirect as retainSafeRedirectHeaders } from "./redirect-headers.ts";
import { fetchWithRuntimeDispatcher } from "./runtime-fetch.ts";
import {
  assertHostnameAllowedWithPolicy,
  closeDispatcher,
  createPinnedDispatcher,
  matchesHostnameAllowlist,
  resolveSsrFPolicyForUrl,
  resolvePinnedHostnameWithPolicy,
  type LookupFn,
  type PinnedDispatcherPolicy,
  SsrFBlockedError,
  type SsrFPolicy,
} from "./ssrf.ts";
import { globalUndiciStreamTimeoutMs } from "./undici-global-dispatcher.ts";
import {
  createHttp3Agent,
  createEnvHttp3ProxyAgent,
  createHttp3ProxyAgent,
} from "./undici-runtime.ts";

function resolveDispatcherTimeoutMs(fromParams: number | undefined): number | undefined {
  if (fromParams !== undefined) {
    return fromParams;
  }
  if (globalUndiciStreamTimeoutMs !== undefined) {
    return globalUndiciStreamTimeoutMs;
  }
  return undefined;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const GUARDED_FETCH_MODE = {
  STRICT: "strict",
  TRUSTED_ENV_PROXY: "trusted_env_proxy",
  TRUSTED_EXPLICIT_PROXY: "trusted_explicit_proxy",
} as const;

export type GuardedFetchMode = (typeof GUARDED_FETCH_MODE)[keyof typeof GUARDED_FETCH_MODE];

export type GuardedFetchOptions = {
  url: string;
  fetchImpl?: FetchLike;
  init?: RequestInit;
  capture?:
    | false
    | {
        flowId?: string;
        meta?: Record<string, unknown>;
      };
  maxRedirects?: number;
  allowCrossOriginUnsafeRedirectReplay?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  requireHttps?: boolean;
  policy?: SsrFPolicy;
  lookupFn?: LookupFn;
  dispatcherPolicy?: PinnedDispatcherPolicy;
  retainAuthorizationRedirectHostnameAllowlist?: string[];
  mode?: GuardedFetchMode;
  pinDns?: boolean;
  proxy?: "env";
  dangerouslyAllowEnvProxyWithoutPinnedDns?: boolean;
  auditContext?: string;
};

export type GuardedFetchResult = {
  response: Response;
  finalUrl: string;
  release: () => Promise<void>;
  refreshTimeout?: () => void;
};

type GuardedFetchInternalOptions = GuardedFetchOptions & {
  managedProxyBypass?: ConfiguredLocalOriginManagedProxyBypass;
  resolveDispatcherPolicy?: (url: URL) => PinnedDispatcherPolicy | undefined;
  useEnvProxyForEligibleUrls?: boolean;
};

type GuardedFetchConfiguredLocalOriginOptions = GuardedFetchOptions & {
  configuredLocalOriginBaseUrl: string;
};

type GuardedFetchPresetOptions = Omit<
  GuardedFetchOptions,
  "mode" | "proxy" | "dangerouslyAllowEnvProxyWithoutPinnedDns"
>;

const DEFAULT_MAX_REDIRECTS = 3;
const OPENCLAW_DEBUG_PROXY_ENABLED = "OPENCLAW_DEBUG_PROXY_ENABLED";

function getRedirectVisitKey(url: string, init: RequestInit | undefined): string {
  return `${init?.method?.toUpperCase() ?? "GET"} ${url}`;
}

function isTruthyEnvValue(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function withStrictGuardedFetchMode(params: GuardedFetchPresetOptions): GuardedFetchOptions {
  return { ...params, mode: GUARDED_FETCH_MODE.STRICT };
}

export function withTrustedEnvProxyGuardedFetchMode(
  params: GuardedFetchPresetOptions,
): GuardedFetchOptions {
  return { ...params, mode: GUARDED_FETCH_MODE.TRUSTED_ENV_PROXY };
}

export function withTrustedExplicitProxyGuardedFetchMode(
  params: GuardedFetchPresetOptions,
): GuardedFetchOptions {
  return { ...params, mode: GUARDED_FETCH_MODE.TRUSTED_EXPLICIT_PROXY };
}

function resolveGuardedFetchMode(params: GuardedFetchOptions): GuardedFetchMode {
  if (params.mode) {
    return params.mode;
  }
  if (params.proxy === "env" && params.dangerouslyAllowEnvProxyWithoutPinnedDns === true) {
    return GUARDED_FETCH_MODE.TRUSTED_ENV_PROXY;
  }
  return GUARDED_FETCH_MODE.STRICT;
}

function isManagedProxyActive(): boolean {
  return process.env["OPENCLAW_PROXY_ACTIVE"] === "1";
}

function assertExplicitProxySupportsPinnedDns(
  url: URL,
  dispatcherPolicy?: PinnedDispatcherPolicy,
  pinDns?: boolean,
): void {
  if (
    pinDns !== false &&
    dispatcherPolicy?.mode === "explicit-proxy" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      "Explicit proxy SSRF pinning requires HTTPS targets; plain HTTP targets are not supported",
    );
  }
}

function createPolicyDispatcherWithoutPinnedDns(
  dispatcherPolicy?: PinnedDispatcherPolicy,
  timeoutMs?: number,
): Dispatcher | null {
  if (!dispatcherPolicy) {
    return null;
  }

  const connectOpts = dispatcherPolicy.connect
    ? { connect: { ...dispatcherPolicy.connect, alpnProtocols: ["h3"] } }
    : { connect: { alpnProtocols: ["h3"] } };

  if (dispatcherPolicy.mode === "direct") {
    return createHttp3Agent(connectOpts, timeoutMs);
  }

  if (dispatcherPolicy.mode === "env-proxy") {
    return createEnvHttp3ProxyAgent(
      {
        ...connectOpts,
        ...(dispatcherPolicy.proxyTls ? { proxyTls: { ...dispatcherPolicy.proxyTls } } : {}),
      },
      timeoutMs,
    );
  }

  const proxyUrl = dispatcherPolicy.proxyUrl.trim();
  if (dispatcherPolicy.proxyTls) {
    return createHttp3ProxyAgent(
      { uri: proxyUrl, requestTls: { ...dispatcherPolicy.proxyTls } },
      timeoutMs,
    );
  }
  return createHttp3ProxyAgent({ uri: proxyUrl }, timeoutMs);
}

async function assertExplicitProxyAllowed(
  dispatcherPolicy: PinnedDispatcherPolicy | undefined,
  lookupFn: LookupFn | undefined,
  policy: SsrFPolicy | undefined,
): Promise<void> {
  if (!dispatcherPolicy || dispatcherPolicy.mode !== "explicit-proxy") {
    return;
  }
  let parsedProxyUrl: URL;
  try {
    parsedProxyUrl = new URL(dispatcherPolicy.proxyUrl);
  } catch {
    throw new Error("Invalid explicit proxy URL");
  }
  if (!["http:", "https:"].includes(parsedProxyUrl.protocol)) {
    throw new Error("Explicit proxy URL must use http or https");
  }
  const proxyPolicy: SsrFPolicy | undefined =
    policy || dispatcherPolicy.allowPrivateProxy === true
      ? {
          ...policy,
          hostnameAllowlist: undefined,
          ...(dispatcherPolicy.allowPrivateProxy === true ? { allowPrivateNetwork: true } : {}),
        }
      : undefined;
  await resolvePinnedHostnameWithPolicy(parsedProxyUrl.hostname, {
    lookupFn,
    policy: proxyPolicy,
  });
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isAmbientGlobalFetch(params: {
  fetchImpl: FetchLike | undefined;
  globalFetch: FetchLike | undefined;
}): boolean {
  return (
    typeof params.fetchImpl === "function" &&
    typeof params.globalFetch === "function" &&
    params.fetchImpl === params.globalFetch
  );
}

export function retainSafeHeadersForCrossOriginRedirectHeaders(
  headers?: HeadersInit,
): Record<string, string> | undefined {
  return retainSafeRedirectHeaders(headers);
}

async function captureGuardedFetchExchange(params: {
  url: string;
  method: string;
  requestHeaders?: Headers | Record<string, string> | undefined;
  requestBody?: BodyInit | Buffer | string | null;
  response: Response;
  transport?: "http" | "sse";
  capture: GuardedFetchOptions["capture"];
  auditContext?: string;
  capturedByGlobalFetchPatch?: boolean;
}): Promise<void> {
  if (params.capture === false || !isTruthyEnvValue(process.env[OPENCLAW_DEBUG_PROXY_ENABLED])) {
    return;
  }
  const { captureHttpExchange, isDebugProxyGlobalFetchPatchInstalled } =
    await import("../../proxy-capture/runtime.js");
  if (params.capturedByGlobalFetchPatch && isDebugProxyGlobalFetchPatchInstalled()) {
    return;
  }
  captureHttpExchange({
    url: params.url,
    method: params.method,
    requestHeaders: params.requestHeaders,
    requestBody: params.requestBody,
    response: params.response,
    transport: params.transport,
    flowId: params.capture?.flowId,
    meta: {
      captureOrigin: "guarded-fetch",
      ...(params.auditContext ? { auditContext: params.auditContext } : {}),
      ...params.capture?.meta,
    },
  });
}

function retainSafeHeadersForCrossOriginRedirect(init?: RequestInit): RequestInit | undefined {
  if (!init?.headers) {
    return init;
  }
  return { ...init, headers: retainSafeRedirectHeaders(init.headers) };
}

function resolveRetainedAuthorizationForRedirect(params: {
  init?: RequestInit;
  nextUrl: URL;
  hostnameAllowlist?: string[];
}): string | undefined {
  const init = params.init;
  if (!init?.headers || !params.hostnameAllowlist?.length) {
    return undefined;
  }
  if (params.nextUrl.protocol !== "https:") {
    return undefined;
  }
  if (
    !params.hostnameAllowlist.includes("*") &&
    !matchesHostnameAllowlist(params.nextUrl.hostname, params.hostnameAllowlist)
  ) {
    return undefined;
  }
  const normalizedInit = normalizeRequestInitHeadersForFetch(init);
  if (!normalizedInit?.headers) {
    return undefined;
  }
  return new Headers(normalizedInit.headers).get("authorization") ?? undefined;
}

function restoreRedirectAuthorization(params: {
  init?: RequestInit;
  authorization?: string;
}): RequestInit | undefined {
  if (!params.authorization) {
    return params.init;
  }
  const headers = new Headers(params.init?.headers);
  headers.set("Authorization", params.authorization);
  return { ...params.init, headers };
}

function dropBodyHeaders(headers?: HeadersInit): HeadersInit | undefined {
  if (!headers) {
    return headers;
  }
  const nextHeaders = new Headers(normalizeHeadersInitForFetch(headers));
  nextHeaders.delete("content-encoding");
  nextHeaders.delete("content-language");
  nextHeaders.delete("content-length");
  nextHeaders.delete("content-location");
  nextHeaders.delete("content-type");
  nextHeaders.delete("transfer-encoding");
  return nextHeaders;
}

function rewriteRedirectInitForMethod(params: {
  init?: RequestInit;
  status: number;
}): RequestInit | undefined {
  const { init, status } = params;
  if (!init) {
    return init;
  }

  const currentMethod = init.method?.toUpperCase() ?? "GET";
  const shouldForceGet =
    status === 303
      ? currentMethod !== "GET" && currentMethod !== "HEAD"
      : (status === 301 || status === 302) && currentMethod === "POST";

  if (!shouldForceGet) {
    return init;
  }

  return {
    ...init,
    method: "GET",
    body: undefined,
    headers: dropBodyHeaders(init.headers),
  };
}

function rewriteRedirectInitForCrossOrigin(params: {
  init?: RequestInit;
  allowUnsafeReplay: boolean;
}): RequestInit | undefined {
  const { init, allowUnsafeReplay } = params;
  if (!init || allowUnsafeReplay) {
    return init;
  }

  const currentMethod = init.method?.toUpperCase() ?? "GET";
  if (currentMethod === "GET" || currentMethod === "HEAD") {
    return init;
  }

  return {
    ...init,
    body: undefined,
    headers: dropBodyHeaders(init.headers),
  };
}

export { fetchWithRuntimeDispatcher } from "./runtime-fetch.ts";

export async function fetchWithSsrFGuard(params: GuardedFetchOptions): Promise<GuardedFetchResult> {
  const { managedProxyBypass: _ignoredManagedProxyBypass, ...publicParams } =
    params as GuardedFetchOptions & {
      managedProxyBypass?: unknown;
    };
  return await fetchWithSsrFGuardInternal(publicParams);
}

export async function fetchConfiguredLocalOriginWithSsrFGuard({
  configuredLocalOriginBaseUrl,
  ...params
}: GuardedFetchConfiguredLocalOriginOptions): Promise<GuardedFetchResult> {
  return await fetchWithSsrFGuardInternal({
    ...params,
    managedProxyBypass: {
      kind: "configured-local-origin",
      baseUrl: configuredLocalOriginBaseUrl,
    },
  });
}

async function fetchWithSsrFGuardInternal(
  params: GuardedFetchInternalOptions,
): Promise<GuardedFetchResult> {
  const defaultFetch: FetchLike | undefined = params.fetchImpl ?? globalThis.fetch;
  if (!defaultFetch) {
    throw new Error("fetch is not available");
  }

  const maxRedirects =
    typeof params.maxRedirects === "number" && Number.isFinite(params.maxRedirects)
      ? Math.max(0, Math.floor(params.maxRedirects))
      : DEFAULT_MAX_REDIRECTS;
  const mode = resolveGuardedFetchMode(params);

  const { signal, cleanup, refresh } = buildTimeoutAbortSignal({
    timeoutMs: params.timeoutMs,
    signal: params.signal,
    operation: "fetchWithSsrFGuard",
    url: params.url,
  });

  let released = false;
  const release = async (dispatcher?: Dispatcher | null) => {
    if (released) {
      return;
    }
    released = true;
    cleanup();
    await closeDispatcher(dispatcher ?? undefined);
  };

  let currentUrl = params.url;
  let currentInit = normalizeRequestInitHeadersForFetch(
    params.init ? { ...params.init } : undefined,
  );
  const visited = new Set<string>([getRedirectVisitKey(currentUrl, currentInit)]);
  let redirectCount = 0;

  while (true) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      await release();
      throw new Error("Invalid URL: must be http or https");
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      await release();
      throw new Error("Invalid URL: must be http or https");
    }
    if (params.requireHttps === true && parsedUrl.protocol !== "https:") {
      await release();
      throw new Error("URL must use https");
    }

    let dispatcher: Dispatcher | null = null;
    const policyForUrl = resolveSsrFPolicyForUrl(parsedUrl, params.policy);
    const dispatcherPolicy = params.resolveDispatcherPolicy?.(parsedUrl) ?? params.dispatcherPolicy;
    try {
      const usesTrustedExplicitProxyMode =
        mode === GUARDED_FETCH_MODE.TRUSTED_EXPLICIT_PROXY &&
        dispatcherPolicy?.mode === "explicit-proxy";
      assertExplicitProxySupportsPinnedDns(
        parsedUrl,
        dispatcherPolicy,
        usesTrustedExplicitProxyMode ? false : params.pinDns,
      );
      await assertExplicitProxyAllowed(dispatcherPolicy, params.lookupFn, params.policy);
      const canUseManagedProxy =
        mode === GUARDED_FETCH_MODE.STRICT && isManagedProxyActive() && hasProxyEnvConfigured();
      const canUseTrustedEnvProxy =
        (mode === GUARDED_FETCH_MODE.TRUSTED_ENV_PROXY ||
          (params.useEnvProxyForEligibleUrls === true && !canUseManagedProxy)) &&
        !dispatcherPolicy &&
        shouldUseEnvHttpProxyForUrl(parsedUrl.toString());
      const canUseMockedFetchWithoutDns =
        params.lookupFn === undefined &&
        !canUseTrustedEnvProxy &&
        !canUseManagedProxy &&
        !usesTrustedExplicitProxyMode &&
        params.pinDns !== false;
      const timeoutMs = resolveDispatcherTimeoutMs(params.timeoutMs);

      if (canUseTrustedEnvProxy || params.pinDns === false) {
        assertHostnameAllowedWithPolicy(parsedUrl.hostname, policyForUrl);
      }

      if (canUseTrustedEnvProxy) {
        dispatcher = createEnvHttp3ProxyAgent(undefined, timeoutMs);
      } else if (canUseManagedProxy) {
        const pinned = await resolvePinnedHostnameWithPolicy(parsedUrl.hostname, {
          lookupFn: params.lookupFn,
          policy: policyForUrl,
        });
        dispatcher = shouldUseConfiguredLocalOriginManagedProxyBypass({
          url: parsedUrl,
          managedProxyBypass: params.managedProxyBypass,
          resolvedAddresses: pinned.addresses,
        })
          ? createPinnedDispatcher(pinned, dispatcherPolicy, policyForUrl, timeoutMs)
          : createEnvHttp3ProxyAgent(undefined, timeoutMs);
      } else if (usesTrustedExplicitProxyMode) {
        assertHostnameAllowedWithPolicy(parsedUrl.hostname, policyForUrl);
        dispatcher = createPolicyDispatcherWithoutPinnedDns(dispatcherPolicy, timeoutMs);
      } else if (canUseMockedFetchWithoutDns) {
        assertHostnameAllowedWithPolicy(parsedUrl.hostname, policyForUrl);
      } else if (params.pinDns === false) {
        await resolvePinnedHostnameWithPolicy(parsedUrl.hostname, {
          lookupFn: params.lookupFn,
          policy: policyForUrl,
        });
        dispatcher = createPolicyDispatcherWithoutPinnedDns(dispatcherPolicy, timeoutMs);
      } else {
        const pinned = await resolvePinnedHostnameWithPolicy(parsedUrl.hostname, {
          lookupFn: params.lookupFn,
          policy: policyForUrl,
        });
        dispatcher = createPinnedDispatcher(pinned, dispatcherPolicy, policyForUrl, timeoutMs);
      }

      const supportsDispatcherInit =
        params.fetchImpl !== undefined &&
        !isAmbientGlobalFetch({
          fetchImpl: params.fetchImpl,
          globalFetch: globalThis.fetch,
        });
      const shouldUseRuntimeFetch = Boolean(dispatcher) && !supportsDispatcherInit;
      const response = shouldUseRuntimeFetch
        ? await fetchWithRuntimeDispatcher(parsedUrl.toString())
        : await defaultFetch(parsedUrl.toString());
      const capturedByGlobalFetchPatch =
        !shouldUseRuntimeFetch &&
        isAmbientGlobalFetch({
          fetchImpl: defaultFetch,
          globalFetch: globalThis.fetch,
        });

      await captureGuardedFetchExchange({
        url: parsedUrl.toString(),
        method: currentInit?.method ?? "GET",
        requestHeaders: currentInit?.headers as Headers | Record<string, string> | undefined,
        requestBody:
          (currentInit as (RequestInit & { body?: BodyInit | null }) | undefined)?.body ?? null,
        response,
        transport: "http",
        capture: params.capture,
        auditContext: params.auditContext,
        capturedByGlobalFetchPatch,
      });

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          await release(dispatcher);
          throw new Error(`Redirect missing location header (${response.status})`);
        }
        redirectCount += 1;
        if (redirectCount > maxRedirects) {
          await release(dispatcher);
          throw new Error(`Too many redirects (limit: ${maxRedirects})`);
        }
        const nextParsedUrl = new URL(location, parsedUrl);
        const nextUrl = nextParsedUrl.toString();
        const retainedAuthorization = resolveRetainedAuthorizationForRedirect({
          init: currentInit,
          nextUrl: nextParsedUrl,
          hostnameAllowlist: params.retainAuthorizationRedirectHostnameAllowlist,
        });
        currentInit = rewriteRedirectInitForMethod({ init: currentInit, status: response.status });
        if (nextParsedUrl.origin !== parsedUrl.origin) {
          currentInit = rewriteRedirectInitForCrossOrigin({
            init: currentInit,
            allowUnsafeReplay: params.allowCrossOriginUnsafeRedirectReplay === true,
          });
          currentInit = retainSafeHeadersForCrossOriginRedirect(currentInit);
          currentInit = restoreRedirectAuthorization({
            init: currentInit,
            authorization: retainedAuthorization,
          });
        }
        const nextVisitKey = getRedirectVisitKey(nextUrl, currentInit);
        if (visited.has(nextVisitKey)) {
          await release(dispatcher);
          throw new Error("Redirect loop detected");
        }
        visited.add(nextVisitKey);
        try {
          await response.body?.cancel();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logWarn(
            `Failed to cancel response body during redirect: ${errorMsg} (url=${currentUrl}, status=${response.status})`,
          );
        }
        await closeDispatcher(dispatcher);
        currentUrl = nextUrl;
        continue;
      }

      return {
        response,
        finalUrl: currentUrl,
        release: async () => release(dispatcher),
        refreshTimeout: refresh,
      };
    } catch (err) {
      if (err instanceof SsrFBlockedError) {
        const context = params.auditContext ?? "url-fetch";
        logWarn(
          `security: blocked URL fetch (${context}) targetOrigin=${parsedUrl.origin} reason=${err.message}`,
        );
      }
      await release(dispatcher);
      throw err;
    }
  }
}