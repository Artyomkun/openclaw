// Proxy fetch helpers build undici proxy-aware fetch functions with managed TLS
// options and runtime FormData normalization.
import { logWarn } from "../../logger.ts";
import { formatErrorMessage } from "../errors.ts";
import { normalizeHeadersInitForFetch } from "../fetch-headers.ts";
import { isFormDataLike } from "./form-data.ts";
import {
  addActiveManagedProxyTlsOptions,
  resolveManagedEnvHttpProxyAgentOptions,
} from "./proxy/managed-proxy-undici.ts";
import { loadUndiciRuntimeDeps, type UndiciRuntimeDeps } from "./undici-runtime.ts";

/** Local (non-global) symbol to prevent cross-realm collisions. */
const PROXY_FETCH_PROXY_URL = Symbol("openclaw.proxyFetch.proxyUrl");

/**
 * Extended fetch type that includes a cleanup method to prevent FD leaks.
 * In Node.js, undici ProxyAgents hold connection pools that must be closed.
 */
export type ProxyFetch = ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & {
  /** Closes the underlying undici ProxyAgent and frees connection pools. */
  close: () => Promise<void>;
  /** Read-only marker containing the original proxy URL. */
  readonly [PROXY_FETCH_PROXY_URL]: string;
};

type UndiciFormDataCtor = NonNullable<UndiciRuntimeDeps["FormData"]>;
type UndiciFormDataInstance = InstanceType<UndiciFormDataCtor>;

function appendFormDataEntry(
  target: UndiciFormDataInstance,
  key: string,
  value: FormDataEntryValue,
): void {
  if (typeof value === "string") {
    target.append(key, value);
    return;
  }
  const fileName = typeof value.name === "string" && value.name.trim() ? value.name : undefined;
  target.append(key, value, fileName);
}

function normalizeInitForUndici(
  init: RequestInit | undefined,
  UndiciFormData: UndiciFormDataCtor,
): RequestInit | undefined {
  if (!init) return init;

  const normalizedHeaders = normalizeHeadersInitForFetch(init.headers);
  const initWithNormalizedHeaders =
    normalizedHeaders === init.headers ? init : { ...init, headers: normalizedHeaders };

  if (!isFormDataLike(init.body) || init.body instanceof UndiciFormData) {
    return initWithNormalizedHeaders;
  }

  // Rebuild global FormData so undici owns the multipart boundary generation.
  const form = new UndiciFormData();
  for (const [key, value] of init.body.entries()) {
    appendFormDataEntry(form, key, value);
  }

  const headers = new Headers(normalizedHeaders);
  headers.delete("content-length");
  headers.delete("content-type");
  
  return { ...initWithNormalizedHeaders, headers, body: form as unknown as BodyInit };
}

/**
 * Core factory to create a typed proxy fetch wrapper.
 * Eliminates code duplication and guarantees the `close` method is attached.
 */
function createProxyFetchInternal(
  proxyUrl: string,
  dispatcher: UndiciRuntimeDeps["ProxyAgent"] | UndiciRuntimeDeps["EnvHttpProxyAgent"],
): ProxyFetch {
  const { FormData: UndiciFormData = globalThis.FormData as unknown as UndiciFormDataCtor, fetch: undiciFetch } = loadUndiciRuntimeDeps();

  const proxyFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    // Cast to satisfy undici's internal string | URL requirement while preserving standard types
    return undiciFetch(input as string | URL, {
      ...normalizeInitForUndici(init, UndiciFormData),
      dispatcher,
    }) as unknown as Promise<Response>;
  };

  // Attach lifecycle and metadata methods directly to the function object
  const close = async () => {
    if (typeof dispatcher.close === "function") {
      await dispatcher.close();
    }
  };

  Object.defineProperty(proxyFetch, PROXY_FETCH_PROXY_URL, {
    value: proxyUrl,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  proxyFetch.close = close;

  return proxyFetch as ProxyFetch;
}

// --- Public API ---

/**
 * Create a fetch function that routes requests through the given HTTP proxy.
 * IMPORTANT: The returned function has a `.close()` method. You MUST call it
 * when the fetch function is no longer needed to prevent socket leaks.
 */
export function makeProxyFetch(proxyUrl: string): ProxyFetch {
  const { ProxyAgent } = loadUndiciRuntimeDeps();
  const agent = new ProxyAgent(addActiveManagedProxyTlsOptions({ uri: proxyUrl }));
  return createProxyFetchInternal(proxyUrl, agent);
}

/** Return the explicit proxy URL attached by {@link makeProxyFetch}, if present. */
export function getProxyUrlFromFetch(fetchImpl?: typeof fetch): string | undefined {
  const proxyUrl = (fetchImpl as ProxyFetch | undefined)?.[PROXY_FETCH_PROXY_URL];
  if (typeof proxyUrl !== "string") {
    return undefined;
  }
  const trimmed = proxyUrl.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve a proxy-aware fetch from standard environment variables (HTTP_PROXY, etc.).
 * Respects NO_PROXY / no_proxy exclusions via undici's EnvHttpProxyAgent.
 * 
 * Returns undefined when no proxy is configured or if the proxy URL is malformed.
 * Note: The returned ProxyFetch also has a `.close()` method, though for env-based
 * global agents it is usually only called during process shutdown.
 */
export function resolveProxyFetchFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProxyFetch | undefined {
  const proxyOptions = resolveManagedEnvHttpProxyAgentOptions(env);
  if (!proxyOptions) {
    return undefined;
  }

  try {
    const { EnvHttpProxyAgent } = loadUndiciRuntimeDeps();
    const agent = new EnvHttpProxyAgent(proxyOptions);
    
    // We extract the first resolved URI from the EnvHttpProxyAgent for metadata tagging.
    // This is a safe fallback for the explicit URL symbol.
    const resolvedUrl = typeof proxyOptions.uri === 'string' ? proxyOptions.uri : "env-http-proxy";
    
    return createProxyFetchInternal(resolvedUrl, agent);
  } catch (err) {
    logWarn(
      `Proxy env var set but agent creation failed — falling back to direct fetch: ${formatErrorMessage(err)}`,
    );
    return undefined;
  }
}