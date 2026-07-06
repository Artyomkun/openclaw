// Proxy validation resolves operator config and probes allowed, denied, and
// APNs destinations through an explicit HTTP(S) forward proxy.
import { randomUUID } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { ProxyConfig } from "../../../config/zod-schema.proxy.ts";
import { fetchWithRuntimeDispatcher } from "../runtime-fetch.ts";
import { createHttp1ProxyAgent } from "../undici-runtime.ts";
import {
  loadManagedProxyTlsOptions,
  resolveManagedProxyCaFileForUrl,
  type ManagedProxyTlsOptions,
} from "./proxy-tls.ts";

// --- Configuration Defaults (Lazy Initialized) ---
const DEFAULT_ALLOWED_URL_STRING = "https://example.com/";
const DEFAULT_APNS_AUTHORITY_STRING = "https://api.sandbox.push.apple.com";

export const getDefaultProxyValidationAllowedUrls = (): readonly URL[] => [
  new URL(DEFAULT_ALLOWED_URL_STRING)
];

export const getDefaultProxyValidationApnsAuthority = (): URL => 
  new URL(DEFAULT_APNS_AUTHORITY_STRING);

const DEFAULT_PROXY_VALIDATION_TIMEOUT_MS = 5000;
const DENIED_CANARY_HEADER = "x-openclaw-proxy-validation-canary";
const APNS_REACHABILITY_REASON = "InvalidProviderToken";

// SRE Fix: Fixed ports for loopback canary with automatic fallback
const LOOPBACK_CANARY_PORTS = [8123, 8124, 0] as const;

// --- Modern Error Handling ---
const extractErrorMessage = (err: unknown): string => 
  err instanceof Error ? err.message : String(err);

/** Describes where the effective proxy validation URL came from. */
export type ProxyValidationConfigSource = "override" | "config" | "env" | "missing" | "disabled";

/** Normalized proxy validation input plus actionable config errors. */
export type ProxyValidationResolvedConfig = {
  enabled: boolean;
  proxyUrl?: URL;
  proxyCaFile?: string;
  source: ProxyValidationConfigSource;
  errors: string[];
};

export type ProxyValidationCheckKind = "allowed" | "denied" | "apns";

export type ProxyValidationCheck = {
  kind: ProxyValidationCheckKind;
  url: URL;
  ok: boolean;
  status?: number;
  error?: string;
};

export type ProxyValidationResult = {
  ok: boolean;
  config: ProxyValidationResolvedConfig;
  checks: ProxyValidationCheck[];
};

export type ProxyValidationFetchCheckParams = {
  proxyUrl: URL;
  proxyTls?: ManagedProxyTlsOptions;
  targetUrl: URL;
  timeoutMs: number;
};

export type ProxyValidationFetchCheckResult = {
  ok: boolean;
  status: number;
  deniedCanaryToken?: string;
};

export type ProxyValidationFetchCheck = (
  params: ProxyValidationFetchCheckParams,
) => Promise<ProxyValidationFetchCheckResult>;

export type ProxyValidationApnsCheckParams = {
  proxyUrl: URL;
  proxyTls?: ManagedProxyTlsOptions;
  authority: URL;
  timeoutMs: number;
};

export type ProxyValidationApnsCheckResult = {
  status: number;
  apnsId?: string;
  apnsReason?: string;
};

export type ProxyValidationApnsCheck = (
  params: ProxyValidationApnsCheckParams,
) => Promise<ProxyValidationApnsCheckResult>;

export type ResolveProxyValidationConfigOptions = {
  config?: ProxyConfig;
  env?: NodeJS.ProcessEnv | Partial<Record<"OPENCLAW_PROXY_URL", string | undefined>>;
  proxyUrlOverride?: string;
  proxyCaFileOverride?: string;
};

export type RunProxyValidationOptions = ResolveProxyValidationConfigOptions & {
  allowedUrls?: readonly URL[] | (() => readonly URL[]);
  deniedUrls?: readonly URL[] | (() => readonly URL[]);
  timeoutMs?: number;
  fetchCheck?: ProxyValidationFetchCheck;
  apnsReachability?: boolean;
  apnsAuthority?: URL | string | (() => URL);
  apnsCheck?: ProxyValidationApnsCheck;
};

// --- Utilities ---

const parseSafeUrl = (value: string | undefined): URL | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try { return new URL(trimmed); } catch { return undefined; }
};

const isHttpOrHttpsUrl = (url: URL): boolean => 
  url.protocol === "http:" || url.protocol === "https:";

const validateProxyUrl = (url: URL | undefined): string[] => {
  if (!url) return ["proxy validation requires proxy.proxyUrl, --proxy-url, or OPENCLAW_PROXY_URL"];
  if (!isHttpOrHttpsUrl(url)) return ["proxyUrl must use http:// or https://"];
  return [];
};

const validateProxyEnabled = (source: ProxyValidationConfigSource, enabled: boolean): string[] => {
  if (enabled || source === "override" || source === "missing" || source === "disabled") return [];
  return source === "env" 
    ? ["proxy validation requires proxy.enabled to be true for OPENCLAW_PROXY_URL"]
    : ["proxy validation requires proxy.enabled to be true for configured proxy URLs"];
};

const validateResolvedProxy = (source: ProxyValidationConfigSource, enabled: boolean, url: URL | undefined): string[] => 
  [...validateProxyUrl(url), ...validateProxyEnabled(source, enabled)];

const parseApnsErrorReason = (body: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const reason = (parsed as { reason?: unknown }).reason;
    return typeof reason === "string" && reason.trim() ? reason : undefined;
  } catch { return undefined; }
};

const hasApnsReachabilityProof = (result: ProxyValidationApnsCheckResult): boolean => 
  !!result.apnsId || (result.status === 403 && result.apnsReason === APNS_REACHABILITY_REASON);

const normalizeTimeoutMs = (value: number | undefined): number =>
  (typeof value === "number" && Number.isFinite(value) && value > 0) 
    ? Math.floor(value) 
    : DEFAULT_PROXY_VALIDATION_TIMEOUT_MS;

const resolveUrls = (input?: readonly URL[] | (() => readonly URL[])): readonly URL[] => {
  if (!input) return [];
  return typeof input === 'function' ? input() : input;
};

const resolveUrl = (input?: URL | string | (() => URL), fallback: () => URL): URL => {
  if (!input) return fallback();
  if (typeof input === 'function') return input();
  return typeof input === 'string' ? new URL(input) : input;
};

// --- Configuration Resolution ---

/** Resolves validation config precedence: explicit override, config, then env. */
export function resolveProxyValidationConfig(
  options: ResolveProxyValidationConfigOptions,
): ProxyValidationResolvedConfig {
  const candidates: Array<{ url?: URL; source: ProxyValidationConfigSource; enabled: boolean }> = [
    { url: parseSafeUrl(options.proxyUrlOverride), source: "override", enabled: true },
    { url: parseSafeUrl(options.config?.proxyUrl), source: "config", enabled: options.config?.enabled === true },
    { url: parseSafeUrl(options.env?.OPENCLAW_PROXY_URL), source: "env", enabled: options.config?.enabled === true },
  ];

  for (const candidate of candidates) {
    if (candidate.url && isHttpOrHttpsUrl(candidate.url)) {
      const proxyCaFile = resolveManagedProxyCaFileForUrl({
        proxyUrl: candidate.url.toString(),
        config: options.config,
        caFileOverride: options.proxyCaFileOverride,
      });
      return {
        enabled: candidate.enabled,
        proxyUrl: candidate.url,
        ...(proxyCaFile ? { proxyCaFile } : {}),
        source: candidate.source,
        errors: validateResolvedProxy(candidate.source, candidate.enabled, candidate.url),
      };
    }
  }

  if (options.config?.enabled === true) {
    return { enabled: true, source: "missing", errors: validateProxyUrl(undefined) };
  }

  return {
    enabled: false,
    source: "disabled",
    errors: ["proxy validation requires proxy.enabled=true with proxy.proxyUrl or OPENCLAW_PROXY_URL, or --proxy-url"],
  };
}

// --- Network Probes (Defaults) ---

async function defaultProxyValidationFetchCheck({
  proxyUrl, proxyTls, targetUrl, timeoutMs,
}: ProxyValidationFetchCheckParams): Promise<ProxyValidationFetchCheckResult> {
  const dispatcher = createHttp1ProxyAgent(
    { uri: proxyUrl.toString(), ...(proxyTls ? { proxyTls } : {}) },
    timeoutMs,
  );
  try {
    const response = await fetchWithRuntimeDispatcher(targetUrl.toString(), {
      dispatcher,
      redirect: "manual",
    });
    void response.body?.dump(); // Aggressively free buffers
    return {
      ok: response.ok,
      status: response.status,
      deniedCanaryToken: response.headers.get(DENIED_CANARY_HEADER) ?? undefined,
    };
  } finally {
    await dispatcher.close(); // Prevent FD leaks
  }
}

// ВНИМАНИЕ: Эта функция должна импортироваться из модуля транспорта APNs (push-apns-http2.ts или http3),
// а не определяться здесь. Оставляем заглушку-адаптер для сохранения архитектуры.
async function defaultProxyValidationApnsCheck({
  proxyUrl, proxyTls, authority, timeoutMs,
}: ProxyValidationApnsCheckParams): Promise<ProxyValidationApnsCheckResult> {
  // Динамический импорт или прямой вызов транспортного модуля
  const { probeApnsHttp2ReachabilityViaProxy } = await import("../../push-apns-http2.js");
  
  const result = await probeApnsHttp2ReachabilityViaProxy({
    proxyUrl: proxyUrl.toString(),
    proxyTls,
    authority: authority.toString(),
    timeoutMs,
  });
  
  return {
    status: result.status,
    apnsId: result.responseHeaders?.["apns-id"],
    apnsReason: parseApnsErrorReason(result.body),
  };
}

// --- Loopback Canary Server ---

type ProxyValidationDeniedTarget = {
  url: URL;
  expectedCanaryToken?: string;
  transportErrorMeansBlocked: boolean;
};

type DeniedCanary = {
  target: ProxyValidationDeniedTarget;
  close: () => Promise<void>;
};

const closeServer = (server: Server): Promise<void> => new Promise((resolve, reject) => {
  server.close((err) => err ? reject(err) : resolve());
});

async function createLoopbackDeniedCanary(): Promise<DeniedCanary> {
  const token = randomUUID();
  const requestHandler = (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(204, { [DENIED_CANARY_HEADER]: token, "cache-control": "no-store" });
    res.end();
  };

  const server = createServer(requestHandler);
  for (const port of LOOPBACK_CANARY_PORTS) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        return {
          target: {
            url: new URL(`http://127.0.0.1:${address.port}/`),
            expectedCanaryToken: token,
            transportErrorMeansBlocked: true,
          },
          close: () => closeServer(server),
        };
      }
    } catch {
      continue;
    }
  }
  
  throw new Error("Failed to bind loopback canary on any designated port");
}

async function resolveDeniedTargets(
  deniedUrls: readonly URL[] | undefined,
): Promise<{ targets: ProxyValidationDeniedTarget[]; close: () => Promise<void> }> {
  if (deniedUrls !== undefined) {
    return {
      targets: deniedUrls.map((url) => ({ url, transportErrorMeansBlocked: false })),
      close: async () => {},
    };
  }

  const canary = await createLoopbackDeniedCanary();
  return { targets: [canary.target], close: canary.close };
}

// --- Probe Runners ---

const runAllowedCheck = async (params: {
  url: URL; proxyUrl: URL; proxyTls?: ManagedProxyTlsOptions; timeoutMs: number; fetchCheck: ProxyValidationFetchCheck;
}): Promise<ProxyValidationCheck> => {
  try {
    const result = await params.fetchCheck({
      proxyUrl: params.proxyUrl, targetUrl: params.url, timeoutMs: params.timeoutMs,
      ...(params.proxyTls ? { proxyTls: params.proxyTls } : {}),
    });
    return !result.ok
      ? { kind: "allowed", url: params.url, ok: false, status: result.status, error: `Allowed destination returned HTTP ${result.status}` }
      : { kind: "allowed", url: params.url, ok: true, status: result.status };
  } catch (err) {
    return { kind: "allowed", url: params.url, ok: false, error: extractErrorMessage(err) };
  }
};

const runDeniedCheck = async (params: {
  target: ProxyValidationDeniedTarget; proxyUrl: URL; proxyTls?: ManagedProxyTlsOptions; timeoutMs: number; fetchCheck: ProxyValidationFetchCheck;
}): Promise<ProxyValidationCheck> => {
  try {
    const result = await params.fetchCheck({
      proxyUrl: params.proxyUrl, targetUrl: params.target.url, timeoutMs: params.timeoutMs,
      ...(params.proxyTls ? { proxyTls: params.proxyTls } : {}),
    });
    
    const tokenMatch = params.target.expectedCanaryToken !== undefined && result.deniedCanaryToken !== params.target.expectedCanaryToken;
    
    if (tokenMatch) {
      return result.ok
        ? { kind: "denied", url: params.target.url, ok: false, status: result.status, error: `Denied loopback canary returned HTTP ${result.status} without the validation token` }
        : { kind: "denied", url: params.target.url, ok: true, status: result.status };
    }
    
    return {
      kind: "denied", url: params.target.url, ok: false, status: result.status,
      error: params.target.expectedCanaryToken === undefined
        ? `Denied destination returned HTTP ${result.status}; expected the proxy to block the connection`
        : `Denied loopback canary was reachable through the proxy with HTTP ${result.status}`,
    };
  } catch (err) {
    const message = extractErrorMessage(err);
    return params.target.transportErrorMeansBlocked
      ? { kind: "denied", url: params.target.url, ok: true, error: message }
      : { kind: "denied", url: params.target.url, ok: false, error: `Denied destination failed without a verifiable proxy-deny signal: ${message}` };
  }
};

const runApnsReachabilityCheck = async (params: {
  authority: URL; proxyUrl: URL; proxyTls?: ManagedProxyTlsOptions; timeoutMs: number; apnsCheck: ProxyValidationApnsCheck;
}): Promise<ProxyValidationCheck> => {
  try {
    const result = await params.apnsCheck({
      proxyUrl: params.proxyUrl, authority: params.authority, timeoutMs: params.timeoutMs,
      ...(params.proxyTls ? { proxyTls: params.proxyTls } : {}),
    });
    
    return hasApnsReachabilityProof(result)
      ? { kind: "apns", url: params.authority, ok: true, status: result.status }
      : { kind: "apns", url: params.authority, ok: false, error: "APNs reachability check failed: response did not include an apns-id header or APNs InvalidProviderToken body. The proxy may be intercepting the connection instead of tunneling it." };
  } catch (err) {
    return { kind: "apns", url: params.authority, ok: false, error: extractErrorMessage(err) };
  }
};

// --- Main Executor ---

/** Runs allowed, denied, and optional APNs proxy validation probes. */
export async function runProxyValidation(
  options: RunProxyValidationOptions,
): Promise<ProxyValidationResult> {
  const config = resolveProxyValidationConfig(options);
  
  if (config.errors.length > 0) return { ok: false, config, checks: [] };
  if (!config.proxyUrl) {
    if (!config.enabled && config.source === "disabled") {
      return { 
        ok: false, 
        config: { 
          ...config, 
          errors: ["Proxy validation is disabled. Set proxy.enabled=true or pass --proxy-url to run validation."] 
        }, 
        checks: [] 
      };
    }
    return { ok: false, config, checks: [] };
  }

  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  let proxyTls: ManagedProxyTlsOptions | undefined;
  try {
    proxyTls = await loadManagedProxyTlsOptions(config.proxyCaFile);
  } catch (err) {
    return { 
      ok: false, 
      config: { 
        ...config, 
        errors: [...config.errors, extractErrorMessage(err)] 
      }, 
      checks: [] 
    };
  }

  const fetchCheck = options.fetchCheck ?? defaultProxyValidationFetchCheck;
  const apnsCheck = options.apnsCheck ?? defaultProxyValidationApnsCheck;
  const apnsAuthority = resolveUrl(
    options.apnsAuthority, 
    getDefaultProxyValidationApnsAuthority
  );
  const allowedUrls = resolveUrls(options.allowedUrls) || getDefaultProxyValidationAllowedUrls();
  const deniedTargets = await resolveDeniedTargets(
    typeof options.deniedUrls === 'function' ? options.deniedUrls() : options.deniedUrls
  );

  try {
    const probes: Promise<ProxyValidationCheck>[] = [
      ...allowedUrls.map(url => runAllowedCheck({ url, proxyUrl: config.proxyUrl!, proxyTls, timeoutMs, fetchCheck })),
      ...deniedTargets.targets.map(target => runDeniedCheck({ target, proxyUrl: config.proxyUrl!, proxyTls, timeoutMs, fetchCheck })),
    ];

    if (options.apnsReachability === true) {
      probes.push(runApnsReachabilityCheck({ authority: apnsAuthority, proxyUrl: config.proxyUrl!, proxyTls, timeoutMs, apnsCheck }));
    }
    
    const results = await Promise.allSettled(probes);
    
    const checks = results.map(result => 
      result.status === "fulfilled" 
        ? result.value 
        : { kind: "allowed" as const, url: new URL("about:blank"), ok: false, error: "Probe promise rejected unexpectedly" }
    );

    return {
      ok: checks.every((check) => check.ok),
      config,
      checks,
    };
  } finally {
    await deniedTargets.close();
  }
}