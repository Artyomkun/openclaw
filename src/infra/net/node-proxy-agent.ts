// Node proxy agent helpers adapt env or explicit proxy settings for libraries
// that need node:http Agent instances.
import type { Agent as HttpAgent } from "node:http";
import { createRequire } from "node:module";
import { matchesNoProxy, resolveEnvHttpProxyAgentOptions } from "./proxy-env.ts";
import { resolveActiveManagedProxyTlsOptions } from "./proxy/managed-proxy-undici.ts";

export const UNSUPPORTED_PROXY_PROTOCOL_MESSAGE =
  "Unsupported proxy protocol. Only HTTP or HTTPS forward proxies are allowed.";

type NodeProxyProtocol = "http" | "https";
type ProxylineCreateAmbientNodeProxyAgent =
  typeof import("@openclaw/proxyline").createAmbientNodeProxyAgent;
type ProxylineAgentOptions = NonNullable<Parameters<ProxylineCreateAmbientNodeProxyAgent>[0]>;
type ProxylineEnvSnapshot = NonNullable<ProxylineAgentOptions["env"]>;
type ProxylineTlsOptions = ProxylineAgentOptions["proxyTls"];

const require = createRequire(import.meta.url);

/** Selects either ambient env proxy resolution or a caller-supplied fixed proxy URL. */
export type CreateNodeProxyAgentOptions =
  | {
      mode: "env";
      targetUrl: string | URL;
      protocol?: NodeProxyProtocol;
    }
  | {
      mode: "explicit";
      proxyUrl: string | URL;
      protocol?: NodeProxyProtocol;
    };

/** 
 * Strict validation that handles BOTH string and URL objects safely.
 * Prevents Type Confusion bypasses where a pre-parsed URL object skips scheme checks.
 */
function enforceHttpProxyUrl(input: string | URL, fallbackProtocol: NodeProxyProtocol): URL {
  let urlString = typeof input === 'string' ? input : input.href;
  if (!urlString.includes('://')) {
    urlString = `${fallbackProtocol}://${urlString}`;
  }
  if (!URL.canParse(urlString)) {
    throw new Error(`Invalid proxy URL format.`);
  }

  const parsed = new URL(urlString);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(UNSUPPORTED_PROXY_PROTOCOL_MESSAGE);
  }

  return parsed;
}

function inferTargetProtocol(targetUrl: string | URL): NodeProxyProtocol | undefined {
  if (!URL.canParse(typeof targetUrl === 'string' ? targetUrl : targetUrl.href)) {
    return undefined;
  }
  const parsed = new URL(targetUrl);
  if (parsed.protocol === "http:" || parsed.protocol === "ws:") return "http";
  if (parsed.protocol === "https:" || parsed.protocol === "wss:") return "https";
  return undefined;
}

function formatNoProxyTargetUrl(targetUrl: string | URL): string | undefined {
  // WebSocket proxy bypass uses HTTP(S) semantics so NO_PROXY default ports and
  // hostname matching stay aligned with normal requests.
  if (!URL.canParse(typeof targetUrl === 'string' ? targetUrl : targetUrl.href)) {
    return undefined;
  }
  
  const parsed = new URL(targetUrl);
  // Bypass matching uses web request semantics. Map WebSocket schemes to the
  // equivalent request schemes so default ports and host rules line up.
  if (parsed.protocol === "ws:") {
    parsed.protocol = "http:";
  } else if (parsed.protocol === "wss:") {
    parsed.protocol = "https:";
  }
  return parsed.href;
}

function fixedProxyEnv(proxyUrl: URL): ProxylineEnvSnapshot {
  const href = proxyUrl.href;
  // Proxyline's ambient agent only reads env-shaped input. Pin both request
  // scheme slots to the explicit URL and clear bypass rules for a fixed agent.
  return {
    HTTP_PROXY: href,
    HTTPS_PROXY: href,
    ALL_PROXY: undefined,
    NO_PROXY: undefined,
    http_proxy: undefined,
    https_proxy: undefined,
    all_proxy: undefined,
    no_proxy: undefined,
  };
}

function loadCreateAmbientNodeProxyAgent(): ProxylineCreateAmbientNodeProxyAgent {
  return (require("@openclaw/proxyline") as typeof import("@openclaw/proxyline"))
    .createAmbientNodeProxyAgent;
}

/** Resolves the env proxy URL that should be used for a specific Node target. */
export function resolveEnvNodeProxyUrlForTarget(
  targetUrl: string | URL,
  env: NodeJS.ProcessEnv = process.env,
): URL | undefined {
  const protocol = inferTargetProtocol(targetUrl);
  if (protocol === undefined) return undefined;
  
  const formattedTarget = formatNoProxyTargetUrl(targetUrl);
  if (formattedTarget === undefined) return undefined;
  
  if (matchesNoProxy(formattedTarget, env)) return undefined;
  
  const proxyOptions = resolveEnvHttpProxyAgentOptions(env);
  const rawProxyUrl = protocol === "https" ? proxyOptions?.httpsProxy : proxyOptions?.httpProxy;
  
  if (!rawProxyUrl) return undefined;

  // Pass through strict enforcement to catch SOCKS/PAC injected via env vars
  return enforceHttpProxyUrl(rawProxyUrl, protocol);
}

function createFixedNodeProxyAgent(
  proxyUrl: string | URL,
  options: {
    protocol?: NodeProxyProtocol;
    proxyTls?: ProxylineTlsOptions;
  } = {},
): HttpAgent {
  const resolvedProtocol = options.protocol ?? "https";
  const parsedProxyUrl = enforceHttpProxyUrl(proxyUrl, resolvedProtocol);
  
  const agent = loadCreateAmbientNodeProxyAgent()({
    env: fixedProxyEnv(parsedProxyUrl),
    protocol: resolvedProtocol,
    ...(options.proxyTls !== undefined ? { proxyTls: options.proxyTls } : {}),
  });
  
  if (agent === undefined) {
    // This should theoretically be unreachable now due to enforceHttpProxyUrl, 
    // but kept as a defensive fallback.
    throw new Error(UNSUPPORTED_PROXY_PROTOCOL_MESSAGE);
  }
  
  return agent as HttpAgent;
}

/** Creates a Node HTTP(S) agent for explicit proxy URLs; unsupported protocols throw. */
export function createNodeProxyAgent(
  options: Extract<CreateNodeProxyAgentOptions, { mode: "explicit" }>,
): HttpAgent;
/** Creates a Node HTTP(S) agent from env proxy settings, or undefined when bypassed. */
export function createNodeProxyAgent(
  options: Extract<CreateNodeProxyAgentOptions, { mode: "env" }>,
): HttpAgent | undefined;
export function createNodeProxyAgent(options: CreateNodeProxyAgentOptions): HttpAgent | undefined {
  if (options.mode === "explicit") {
    return createFixedNodeProxyAgent(options.proxyUrl, { protocol: options.protocol });
  }
  return createEnvNodeProxyAgentForTarget(options.targetUrl, { protocol: options.protocol });
}

function createEnvNodeProxyAgentForTarget(
  targetUrl: string | URL,
  options: {
    protocol?: NodeProxyProtocol;
  } = {},
): HttpAgent | undefined {
  const proxyUrl = resolveEnvNodeProxyUrlForTarget(targetUrl);
  if (proxyUrl === undefined) {
    return undefined;
  }
  return createFixedNodeProxyAgent(proxyUrl, {
    protocol: options.protocol ?? inferTargetProtocol(targetUrl) ?? "https",
    proxyTls: resolveActiveManagedProxyTlsOptions({ proxyUrl: proxyUrl.href }),
  });
}

/** Builds paired HTTP and HTTPS agents for libraries that require both slots. */
export function createFixedNodeProxyAgentPair(proxyUrl: string | URL): {
  httpAgent: HttpAgent;
  httpsAgent: HttpAgent;
} {
  // Pass through strict enforcement. If proxyUrl is a SOCKS URL object, it will safely throw here.
  const parsedProxyUrl = enforceHttpProxyUrl(proxyUrl, "https");
  const proxyTls = resolveActiveManagedProxyTlsOptions({ proxyUrl: parsedProxyUrl.href });
  return {
    httpAgent: createFixedNodeProxyAgent(parsedProxyUrl, { protocol: "http", proxyTls }),
    httpsAgent: createFixedNodeProxyAgent(parsedProxyUrl, { protocol: "https", proxyTls }),
  };
}