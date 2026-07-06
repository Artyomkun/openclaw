// Managed proxy TLS helpers resolve and load CA trust only for HTTPS forward
// proxies that OpenClaw owns or inherited from a parent process.
// 
// HTTP/3 Support: Uses Undici with ALPN for HTTP/3 negotiation.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ProxyConfig } from "../../../config/zod-schema.proxy.ts";

/** TLS trust material passed to proxy clients for OpenClaw-managed proxies. */
export type ManagedProxyTlsOptions = Readonly<{
  ca?: string;
  /** ALPN protocols for HTTP/3 negotiation */
  alpnProtocols?: string[];
}>;

/** HTTP/3 proxy configuration with connection pooling */
export type Http3ProxyConfig = {
  /** Proxy URL (http:// or https://) */
  url: string;
  /** CA certificate for TLS validation */
  ca?: string;
  /** Maximum concurrent streams per connection */
  maxConcurrentStreams?: number;
  /** Connection idle timeout in ms */
  idleTimeoutMs?: number;
};

function normalizeOptionalPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatReadError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isProxyUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isHttpsProxyUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Resolves the configured managed proxy CA file, with env/CLI override first. */
export function resolveManagedProxyCaFile(params: {
  config?: ProxyConfig;
  caFileOverride?: string;
}): string | undefined {
  return (
    normalizeOptionalPath(params.caFileOverride) ??
    normalizeOptionalPath(params.config?.tls?.caFile)
  );
}

/** Returns a CA file only for HTTPS proxy URLs; HTTP proxies do not need TLS trust. */
export function resolveManagedProxyCaFileForUrl(params: {
  proxyUrl: string | undefined;
  config?: ProxyConfig;
  caFileOverride?: string;
}): string | undefined {
  if (!isHttpsProxyUrl(params.proxyUrl)) {
    return undefined;
  }
  return resolveManagedProxyCaFile({
    config: params.config,
    caFileOverride: params.caFileOverride,
  });
}

/** Loads managed proxy TLS options asynchronously for startup paths. */
export async function loadManagedProxyTlsOptions(
  caFile: string | undefined,
  alpnProtocols: string[] = ['h3', 'h2', 'http/1.1'],
): Promise<ManagedProxyTlsOptions | undefined> {
  if (!caFile) {
    return undefined;
  }
  try {
    return {
      ca: await readFile(caFile, "utf8"),
      alpnProtocols,
    };
  } catch (err) {
    throw new Error(`proxy CA file could not be read (${caFile}): ${formatReadError(err)}`, {
      cause: err,
    });
  }
}

/** Loads managed proxy TLS options synchronously for inherited child-process routing. */
export function loadManagedProxyTlsOptionsSync(
  caFile: string | undefined,
  alpnProtocols: string[] = ['h3', 'h2', 'http/1.1'],
): ManagedProxyTlsOptions | undefined {
  if (!caFile) {
    return undefined;
  }
  try {
    return {
      ca: readFileSync(caFile, "utf8"),
      alpnProtocols,
    };
  } catch (err) {
    throw new Error(`proxy CA file could not be read (${caFile}): ${formatReadError(err)}`, {
      cause: err,
    });
  }
}

/**
 * Creates HTTP/3 proxy configuration for Undici dispatcher.
 * 
 * @example
 * ```typescript
 * const proxyConfig = createHttp3ProxyConfig({
 *   url: 'https://proxy.example.com:443',
 *   ca: '/path/to/ca.pem',
 *   maxConcurrentStreams: 100,
 * });
 * 
 * const dispatcher = new ProxyAgent(proxyConfig);
 * ```
 */
export function createHttp3ProxyConfig(config: Http3ProxyConfig): {
  dispatcherOptions: {
    proxy: string;
    tls: {
      ca?: string;
      alpnProtocols: string[];
    };
    connections: {
      maxConcurrentStreams: number;
      idleTimeout: number;
    };
  };
} {
  const maxConcurrentStreams = config.maxConcurrentStreams ?? 100;
  const idleTimeout = config.idleTimeoutMs ?? 60000;

  return {
    dispatcherOptions: {
      proxy: config.url,
      tls: {
        ca: config.ca,
        alpnProtocols: ['h3', 'h2', 'http/1.1'],
      },
      connections: {
        maxConcurrentStreams,
        idleTimeout,
      },
    },
  };
}

/**
 * Validates that proxy URL supports HTTP/3.
 */
export function validateHttp3ProxySupport(proxyUrl: string): boolean {
  if (!proxyUrl) {
    return false;
  }
  try {
    const url = new URL(proxyUrl);
    // HTTP/3 requires HTTPS (or HTTP for local development with allow-http flag)
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Gets ALPN protocols for proxy connection.
 * Prioritizes HTTP/3, falls back to HTTP/2, then HTTP/1.1.
 */
export function getAlpnProtocols(): string[] {
  return ['h3', 'h2', 'http/1.1'];
}