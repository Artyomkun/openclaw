// Bridges OpenClaw-managed proxy TLS trust into Undici EnvHttpProxyAgent and
// explicit ProxyAgent options without changing unrelated operator proxies.
import { isRecord as isProxyTlsRecord } from "@openclaw/normalization-core/record-coerce";
import type { EnvHttpProxyAgent } from "undici";
import { logWarn } from "../../../logger.ts";
import { resolveEnvHttpProxyAgentOptions, resolveEnvHttpProxyUrl } from "../proxy-env.ts";
import { getActiveManagedProxyTlsOptions, getActiveManagedProxyUrl } from "./active-proxy-state.ts";
import {
  loadManagedProxyTlsOptionsSync,
  resolveManagedProxyCaFileForUrl,
  type ManagedProxyTlsOptions,
} from "./proxy-tls.ts";

type ManagedEnvHttpProxyAgentOptions = ConstructorParameters<typeof EnvHttpProxyAgent>[0];

// --- Modern Type Definitions ---

/** 
 * Structural interface matching Undici's various proxy agent option shapes.
 * Replaces unsafe `object` type and `Reflect.get` usage.
 */
interface UndiciProxyOptionsLike {
  uri?: string | URL;
  httpsProxy?: string;
  httpProxy?: string;
  proxyTls?: unknown;
}

/** 
 * Clean conditional type replacing 15 lines of messy function overloads.
 * Accurately reflects the merge logic of the function.
 */
type ProxyTlsMergeResult<TOptions> =
  | undefined
  | { proxyTls: ManagedProxyTlsOptions }
  | (TOptions & { proxyTls: ManagedProxyTlsOptions });

type ManagedProxyTlsEnv = NodeJS.ProcessEnv;

type ResolveActiveManagedProxyTlsOptionsParams = {
  proxyUrl?: string;
  env?: ManagedProxyTlsEnv;
};

type AddActiveManagedProxyTlsOptionsParams = {
  env?: ManagedProxyTlsEnv;
};

/** Safely normalizes a URL string using Node.js 20+ native API. */
function normalizeProxyUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // 2026 Standard: URL.canParse avoids try/catch overhead and GC pressure
  return URL.canParse(value) ? new URL(value).href : undefined;
}

/** Extracts the target proxy URL from various Undici agent config shapes. */
function readProxyUrlFromOptions(options: UndiciProxyOptionsLike | undefined): string | undefined {
  if (!options) return undefined;
  
  if (options.uri) {
    return options.uri instanceof URL ? options.uri.href : options.uri;
  }
  
  // Fallback to explicit protocol-specific properties
  return options.httpsProxy ?? options.httpProxy;
}

/** Extracts caller-provided TLS options if they are valid records. */
function readProxyTlsRecord(options: UndiciProxyOptionsLike | undefined): Record<string, unknown> | undefined {
  if (options?.proxyTls && isProxyTlsRecord(options.proxyTls)) {
    return options.proxyTls;
  }
  return undefined;
}

function resolveManagedProxyUrl(env: ManagedProxyTlsEnv = process.env): string | undefined {
  const activeProxyUrl = getActiveManagedProxyUrl();
  if (activeProxyUrl) {
    return activeProxyUrl.href;
  }
  if (env["OPENCLAW_PROXY_ACTIVE"] !== "1") {
    return undefined;
  }
  // Child processes inherit only env, so recover the managed proxy URL from
  // HTTPS proxy settings when the active in-process registration is absent.
  return normalizeProxyUrl(resolveEnvHttpProxyUrl("https", env));
}

/** Resolves managed proxy TLS trust only when the target proxy is OpenClaw's active proxy. */
export function resolveActiveManagedProxyTlsOptions(
  params?: ResolveActiveManagedProxyTlsOptionsParams,
): ManagedProxyTlsOptions | undefined {
  const env = params?.env ?? process.env;
  const managedProxyUrl = resolveManagedProxyUrl(env);
  const targetProxyUrl = normalizeProxyUrl(
    params?.proxyUrl ?? resolveEnvHttpProxyUrl("https", env),
  );
  
  // Ensure we only inject TLS for OUR proxy, not for random user-defined proxies
  if (!managedProxyUrl || targetProxyUrl !== managedProxyUrl) {
    return undefined;
  }
  
  const activeProxyTls = getActiveManagedProxyTlsOptions();
  if (activeProxyTls) {
    return activeProxyTls;
  }
  
  const proxyCaFile = resolveManagedProxyCaFileForUrl({
    proxyUrl: managedProxyUrl,
    caFileOverride: env["OPENCLAW_PROXY_CA_FILE"],
  });
  
  try {
    return loadManagedProxyTlsOptionsSync(proxyCaFile);
  } catch (err) {
    // SRE/Security: Missing CA files on an active managed proxy is a potential MITM risk.
    // We fallback to allow non-managed traffic to continue, but we MUST log the incident.
    logWarn(
      `proxy: Failed to load managed CA file for active proxy ${managedProxyUrl}. ` +
      `TLS validation may be incomplete. Error: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}

/**
 * Adds active managed proxy TLS options to explicit proxy agent options.
 * Uses a single clean generic signature instead of verbose overloads.
 */
export function addActiveManagedProxyTlsOptions<TOptions extends UndiciProxyOptionsLike>(
  options: TOptions | undefined,
  params?: AddActiveManagedProxyTlsOptionsParams,
): ProxyTlsMergeResult<TOptions> {
  const proxyTls = resolveActiveManagedProxyTlsOptions({
    proxyUrl: readProxyUrlFromOptions(options),
    env: params?.env,
  });
  
  if (!proxyTls) {
    // Type assertion is safe here because returning `options` matches the `undefined` 
    // or `TOptions` branches of our union type.
    return options as ProxyTlsMergeResult<TOptions>;
  }
  
  const existingProxyTls = readProxyTlsRecord(options);
  
  // Caller-supplied proxyTls wins over managed defaults so explicit TLS policy
  // is not overwritten while still inheriting missing managed CA fields.
  return {
    ...options,
    proxyTls: {
      ...proxyTls,
      ...existingProxyTls,
    },
  } as ProxyTlsMergeResult<TOptions>;
}

/** Resolves env proxy options with managed proxy TLS attached when applicable. */
export function resolveManagedEnvHttpProxyAgentOptions(
  env: NodeJS.ProcessEnv = process.env,
): ManagedEnvHttpProxyAgentOptions | undefined {
  return addActiveManagedProxyTlsOptions(resolveEnvHttpProxyAgentOptions(env), { env });
}