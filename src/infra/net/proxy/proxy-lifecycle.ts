// Managed proxy lifecycle installs Proxyline, injects process proxy env, and
// restores inherited/direct routing when owner handles stop.
import {
  installGlobalProxy,
  type ProxylineHandle,
  type ProxylineUndiciOptions,
} from "@openclaw/proxyline";
import type { ProxyConfig } from "../../../config/zod-schema.proxy.ts";
import { isLoopbackIpAddress } from "@openclaw/net-policy/ip";
import { logInfo, logWarn } from "../../../logger.ts";
import { forceResetGlobalDispatcher } from "../undici-global-dispatcher.ts";
import {
  getActiveManagedProxyLoopbackMode,
  getActiveManagedProxyUrl,
  registerActiveManagedProxyUrl,
  stopActiveManagedProxyRegistration,
  type ActiveManagedProxyRegistration,
} from "./active-proxy-state.ts";
import {
  loadManagedProxyTlsOptions,
  loadManagedProxyTlsOptionsSync,
  resolveManagedProxyCaFileForUrl,
} from "./proxy-tls.ts";

/** Process-wide managed proxy handle returned to CLI/gateway startup owners. */
export type ProxyHandle = {
  /** The operator-managed proxy URL injected into process.env. */
  proxyUrl: string;
  /** Restore process-wide proxy state. */
  stop: () => Promise<void>;
  /** Synchronously restore process-wide proxy state during hard process exit. */
  kill: (signal?: NodeJS.Signals) => void;
};

type ProxyLoopbackMode = NonNullable<NonNullable<ProxyConfig>["loopbackMode"]>;

const PROXY_ENV_KEYS = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"] as const;
const NO_PROXY_ENV_KEYS = ["no_proxy", "NO_PROXY"] as const;
const PROXY_ACTIVE_KEYS = [
  "OPENCLAW_PROXY_ACTIVE",
  "OPENCLAW_PROXY_LOOPBACK_MODE",
  "OPENCLAW_PROXY_CA_FILE",
] as const;
const ALL_PROXY_ENV_KEYS = [...PROXY_ENV_KEYS, ...NO_PROXY_ENV_KEYS, ...PROXY_ACTIVE_KEYS] as const;
type ProxyEnvKey = (typeof ALL_PROXY_ENV_KEYS)[number];
type ProxyEnvSnapshot = Partial<Record<ProxyEnvKey, string | undefined>>;

let baseProxyEnvSnapshot: ProxyEnvSnapshot | null = null;
let proxylineHandle: ProxylineHandle | null = null;

const MANAGED_PROXY_UNDICI_OPTIONS = Object.freeze({
  allowH2: false,
}) satisfies ProxylineUndiciOptions;

/** 
 * @internal Exposed strictly for test suite isolation. 
 * Do not call in application code.
 */
export function resetProxyLifecycleForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetProxyLifecycleForTests can only be called in test environment");
  }
  baseProxyEnvSnapshot = null;
  proxylineHandle?.stop();
  proxylineHandle = null;
}

function captureProxyEnv(): ProxyEnvSnapshot {
  const snapshot: ProxyEnvSnapshot = {};
  for (const key of ALL_PROXY_ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreProxyEnv(snapshot: ProxyEnvSnapshot): void {
  for (const key of ALL_PROXY_ENV_KEYS) {
    // Modern Node.js standard: assigning undefined safely unsets the env var
    // without breaking object shape or proxies compared to `delete`.
    process.env[key] = snapshot[key];
  }
}

function injectProxyEnv(
  proxyUrl: string,
  loopbackMode: ProxyLoopbackMode,
  proxyCaFile: string | undefined,
): ProxyEnvSnapshot {
  const snapshot = captureProxyEnv();
  
  for (const key of PROXY_ENV_KEYS) process.env[key] = proxyUrl;
  for (const key of NO_PROXY_ENV_KEYS) process.env[key] = "";
  
  process.env["OPENCLAW_PROXY_ACTIVE"] = "1";
  process.env["OPENCLAW_PROXY_LOOPBACK_MODE"] = loopbackMode;
  process.env["OPENCLAW_PROXY_CA_FILE"] = proxyCaFile ?? "";

  return snapshot;
}

function parseSafeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSupportedProxyUrl(value: string): boolean {
  const url = parseSafeUrl(value);
  return url ? (url.protocol === "http:" || url.protocol === "https:") : false;
}

function redactProxyUrlForLog(value: string): string {
  const url = parseSafeUrl(value);
  return url ? url.origin : "<invalid proxy URL>";
}

function resolveProxyUrl(config: ProxyConfig | undefined): string {
  const candidate = config?.proxyUrl?.trim() || process.env["OPENCLAW_PROXY_URL"]?.trim();
  if (!candidate || !isSupportedProxyUrl(candidate)) {
    throw new Error(
      "proxy: enabled but no valid HTTP proxy URL is configured; set proxy.proxyUrl " +
        "or OPENCLAW_PROXY_URL to an http:// or https:// forward proxy.",
    );
  }
  return candidate;
}

const CONTROL_PLANE_PROTOCOLS = new Set(["ws:", "wss:", "http:", "https:"]);

function isLoopbackHost(hostname: string): boolean {
  const normalizedHost = hostname.trim().toLowerCase().replace(/\.+$/, "");
  return normalizedHost === "localhost" || isLoopbackIpAddress(hostname);
}

/**
 * Extracts the authority (host:port) if the URL is a trusted loopback control plane URL.
 */
function getLoopbackBypassAuthority(urlString: string): string | null {
  const url = parseSafeUrl(urlString);
  if (!url || !CONTROL_PLANE_PROTOCOLS.has(url.protocol) || !isLoopbackHost(url.hostname)) {
    return null;
  }
  return url.port ? `${url.hostname}:${url.port}` : url.hostname;
}

/**
 * Core logic for bypassing the proxy for trusted loopback IPC (Gateway or CDP).
 * DRY implementation used by both Gateway and Browser bypasses.
 */
function registerTrustedLoopbackBypass(url: string, blockErrorMessage: string): (() => void) | undefined {
  if (!getLoopbackBypassAuthority(url)) {
    return undefined;
  }
  
  const loopbackMode = getActiveManagedProxyLoopbackMode();
  if (loopbackMode === "block") {
    throw new Error(blockErrorMessage);
  }
  if (loopbackMode === "proxy") {
    return undefined;
  }

  return proxylineHandle?.registerBypass({ url });
}

/** 
 * Registers a temporary direct route for trusted Gateway loopback control-plane URLs. 
 * Delegates to unified loopback bypass logic.
 */
export function registerManagedProxyGatewayLoopbackBypass(url: string): (() => void) | undefined {
  return registerTrustedLoopbackBypass(
    url, 
    "proxy: Gateway loopback control-plane connections are blocked by proxy.loopbackMode"
  );
}

/**
 * Carve out the operator-managed external proxy for the Browser plugin's
 * loopback CDP probe to a Chromium instance OpenClaw spawned itself.
 * Delegates to unified loopback bypass logic.
 */
export function registerManagedProxyBrowserCdpBypass(url: string): (() => void) | undefined {
  return registerTrustedLoopbackBypass(
    url, 
    "proxy: Browser loopback CDP connections are blocked by proxy.loopbackMode"
  );
}

function restoreInactiveProxyRuntime(snapshot: ProxyEnvSnapshot): void {
  try {
    proxylineHandle?.stop();
  } catch (err) {
    logWarn(`proxy: failed to stop Proxyline: ${String(err)}`);
  }
  proxylineHandle = null;
  restoreProxyEnv(snapshot);
  forceResetGlobalDispatcher();
  ensureInheritedManagedProxyRoutingActive();
}

function restoreAfterFailedProxyActivation(restoreSnapshot: ProxyEnvSnapshot): void {
  restoreInactiveProxyRuntime(restoreSnapshot);
  baseProxyEnvSnapshot = null;
}

function stopActiveProxyRegistration(registration: ActiveManagedProxyRegistration): void {
  if (registration.stopped) return;
  stopActiveManagedProxyRegistration(registration);
  if (!getActiveManagedProxyUrl()) {
    const restoreSnapshot = baseProxyEnvSnapshot ?? captureProxyEnv();
    baseProxyEnvSnapshot = null;
    restoreInactiveProxyRuntime(restoreSnapshot);
  }
}

/** Reinstalls Proxyline routing in child processes that inherited active proxy env. */
export function ensureInheritedManagedProxyRoutingActive(): void {
  if (process.env["OPENCLAW_PROXY_ACTIVE"] !== "1") return;
  
  const proxyUrl = process.env["HTTP_PROXY"];
  if (!proxyUrl || !isSupportedProxyUrl(proxyUrl)) return;

  const proxyCaFile = resolveManagedProxyCaFileForUrl({
    proxyUrl,
    caFileOverride: process.env["OPENCLAW_PROXY_CA_FILE"],
  });
  
  const proxyTls = loadManagedProxyTlsOptionsSync(proxyCaFile);
  proxylineHandle = installGlobalProxy({
    mode: "managed",
    proxyUrl,
    ...(proxyTls ? { proxyTls } : {}),
    ifActive: "reuse-compatible",
    undici: MANAGED_PROXY_UNDICI_OPTIONS,
  });
  
  forceResetGlobalDispatcher({ preserveProxylineManaged: true });
}

/** Starts process-wide managed proxy routing and returns the owner stop handle. */
export async function startProxy(config: ProxyConfig | undefined): Promise<ProxyHandle | null> {
  if (config?.enabled !== true) return null;

  const proxyUrl = resolveProxyUrl(config);
  const loopbackMode = config.loopbackMode ?? "gateway-only";
  const proxyCaFile = resolveManagedProxyCaFileForUrl({ proxyUrl, config });
  const proxyTls = await loadManagedProxyTlsOptions(proxyCaFile);
  
  const activeProxyUrl = getActiveManagedProxyUrl();
  if (activeProxyUrl) {
    const registration = registerActiveManagedProxyUrl(new URL(proxyUrl), { loopbackMode, proxyTls });
    return {
      proxyUrl,
      stop: async () => stopActiveProxyRegistration(registration),
      kill: () => stopActiveProxyRegistration(registration),
    };
  }
  baseProxyEnvSnapshot ??= captureProxyEnv();
  const lifecycleBaseEnvSnapshot = baseProxyEnvSnapshot;
  let registration: ActiveManagedProxyRegistration | null = null;

  try {
    injectProxyEnv(proxyUrl, loopbackMode, proxyCaFile);
    proxylineHandle = installGlobalProxy({
      mode: "managed",
      proxyUrl,
      ...(proxyTls ? { proxyTls } : {}),
      ifActive: "replace",
      undici: MANAGED_PROXY_UNDICI_OPTIONS,
    });
    forceResetGlobalDispatcher({ preserveProxylineManaged: true });
    registration = registerActiveManagedProxyUrl(new URL(proxyUrl), { loopbackMode, proxyTls });
  } catch (err) {
    if (registration) stopActiveManagedProxyRegistration(registration);
    restoreAfterFailedProxyActivation(lifecycleBaseEnvSnapshot);
    throw new Error(`proxy: failed to activate external proxy routing: ${String(err)}`, { cause: err });
  }

  logInfo(`proxy: routing process HTTP traffic through external proxy ${redactProxyUrlForLog(proxyUrl)}`);

  return {
    proxyUrl,
    stop: async () => { if (registration) stopActiveProxyRegistration(registration); },
    kill: () => { if (registration) stopActiveProxyRegistration(registration); },
  };
}

/** Stops a managed proxy handle if one was started. */
export async function stopProxy(handle: ProxyHandle | null): Promise<void> {
  if (!handle) return;
  await handle.stop();
}