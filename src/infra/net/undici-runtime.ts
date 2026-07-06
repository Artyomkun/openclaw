// Undici runtime helpers for standard HTTP/1.1, HTTP/2 and HTTP/3 dispatchers
import { createRequire } from "node:module";

/** Runtime-loaded undici constructors/functions. */
export type UndiciRuntimeDeps = {
  Agent: typeof import("undici").Agent;
  EnvHttpProxyAgent: typeof import("undici").EnvHttpProxyAgent;
  FormData?: typeof import("undici").FormData;
  ProxyAgent: typeof import("undici").ProxyAgent;
  fetch: typeof import("undici").fetch;
};

/** Minimal undici surface needed by global-dispatcher installation code. */
export type UndiciGlobalDispatcherDeps = Pick<UndiciRuntimeDeps, "Agent" | "EnvHttpProxyAgent"> & {
  getGlobalDispatcher: typeof import("undici").getGlobalDispatcher;
  setGlobalDispatcher: typeof import("undici").setGlobalDispatcher;
};

type UndiciAgentOptions = ConstructorParameters<UndiciRuntimeDeps["Agent"]>[0];
type UndiciEnvHttpProxyAgentOptions = ConstructorParameters<
  UndiciRuntimeDeps["EnvHttpProxyAgent"]
>[0];
type UndiciProxyAgentOptions = ConstructorParameters<UndiciRuntimeDeps["ProxyAgent"]>[0];

function isUndiciRuntimeDeps(value: unknown): value is UndiciRuntimeDeps {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UndiciRuntimeDeps).Agent === "function" &&
    typeof (value as UndiciRuntimeDeps).EnvHttpProxyAgent === "function" &&
    typeof (value as UndiciRuntimeDeps).ProxyAgent === "function" &&
    typeof (value as UndiciRuntimeDeps).fetch === "function"
  );
}

function isUndiciGlobalDispatcherDeps(value: unknown): value is UndiciGlobalDispatcherDeps {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UndiciGlobalDispatcherDeps).Agent === "function" &&
    typeof (value as UndiciGlobalDispatcherDeps).EnvHttpProxyAgent === "function" &&
    typeof (value as UndiciGlobalDispatcherDeps).getGlobalDispatcher === "function" &&
    typeof (value as UndiciGlobalDispatcherDeps).setGlobalDispatcher === "function"
  );
}

/**
 * Loads undici lazily, allowing tests to inject constructors.
 */
export function loadUndiciRuntimeDeps(): UndiciRuntimeDeps {
  const require = createRequire(import.meta.url);
  const undici = require("undici") as typeof import("undici");
  return {
    Agent: undici.Agent,
    EnvHttpProxyAgent: undici.EnvHttpProxyAgent,
    FormData: undici.FormData,
    ProxyAgent: undici.ProxyAgent,
    fetch: undici.fetch,
  };
}

/**
 * Loads only the undici global-dispatcher API.
 */
export function loadUndiciGlobalDispatcherDeps(): UndiciGlobalDispatcherDeps {
  const require = createRequire(import.meta.url);
  const undici = require("undici") as typeof import("undici");
  return {
    Agent: undici.Agent,
    EnvHttpProxyAgent: undici.EnvHttpProxyAgent,
    getGlobalDispatcher: undici.getGlobalDispatcher,
    setGlobalDispatcher: undici.setGlobalDispatcher,
  };
}

// ============================================================================
// HTTP/1.1 Dispatchers
// ============================================================================

/**
 * Creates a standard undici Agent (HTTP/1.1).
 */
export function createHttpAgent(
  options?: UndiciAgentOptions,
  timeoutMs?: number,
): import("undici").Agent {
  const { Agent } = loadUndiciRuntimeDeps();
  const opts = { ...options };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    opts.bodyTimeout = Math.floor(timeoutMs);
    opts.headersTimeout = Math.floor(timeoutMs);
  }
  return new Agent(opts);
}

/**
 * Creates a standard EnvHttpProxyAgent (HTTP/1.1).
 */
export function createEnvHttpProxyAgent(
  options?: UndiciEnvHttpProxyAgentOptions,
  timeoutMs?: number,
): import("undici").EnvHttpProxyAgent {
  const { EnvHttpProxyAgent } = loadUndiciRuntimeDeps();
  const opts = { ...options };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    opts.bodyTimeout = Math.floor(timeoutMs);
    opts.headersTimeout = Math.floor(timeoutMs);
  }
  return new EnvHttpProxyAgent(opts);
}

/**
 * Creates a standard ProxyAgent (HTTP/1.1).
 */
export function createProxyAgent(
  options: UndiciProxyAgentOptions,
  timeoutMs?: number,
): import("undici").ProxyAgent {
  const { ProxyAgent } = loadUndiciRuntimeDeps();
  const normalized =
    typeof options === "string" || options instanceof URL
      ? { uri: options.toString() }
      : { ...options };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    normalized.bodyTimeout = Math.floor(timeoutMs);
    normalized.headersTimeout = Math.floor(timeoutMs);
  }
  return new ProxyAgent(normalized);
}

// ============================================================================
// HTTP/2 Dispatchers
// ============================================================================

/**
 * Creates an undici Agent with HTTP/2 support.
 */
export function createHttp2Agent(
  options?: UndiciAgentOptions,
  timeoutMs?: number,
): import("undici").Agent {
  const { Agent } = loadUndiciRuntimeDeps();
  const opts = {
    ...options,
    allowH2: true,
  };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    opts.bodyTimeout = Math.floor(timeoutMs);
    opts.headersTimeout = Math.floor(timeoutMs);
  }
  return new Agent(opts);
}

/**
 * Creates an EnvHttpProxyAgent with HTTP/2 support.
 */
export function createEnvHttp2ProxyAgent(
  options?: UndiciEnvHttpProxyAgentOptions,
  timeoutMs?: number,
): import("undici").EnvHttpProxyAgent {
  const { EnvHttpProxyAgent } = loadUndiciRuntimeDeps();
  const opts = {
    ...options,
    allowH2: true,
  };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    opts.bodyTimeout = Math.floor(timeoutMs);
    opts.headersTimeout = Math.floor(timeoutMs);
  }
  return new EnvHttpProxyAgent(opts);
}

/**
 * Creates a ProxyAgent with HTTP/2 support.
 */
export function createHttp2ProxyAgent(
  options: UndiciProxyAgentOptions,
  timeoutMs?: number,
): import("undici").ProxyAgent {
  const { ProxyAgent } = loadUndiciRuntimeDeps();
  const normalized =
    typeof options === "string" || options instanceof URL
      ? { uri: options.toString() }
      : { ...options };
  const opts = {
    ...normalized,
    allowH2: true,
  };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    opts.bodyTimeout = Math.floor(timeoutMs);
    opts.headersTimeout = Math.floor(timeoutMs);
  }
  return new ProxyAgent(opts);
}

// ============================================================================
// HTTP/3 Dispatchers
// ============================================================================

/**
 * Creates an undici Agent with HTTP/3 support.
 * Requires Node.js with --experimental-fetch and --experimental-quic flags.
 */
export function createHttp3Agent(
  options?: UndiciAgentOptions,
  timeoutMs?: number,
): import("undici").Agent {
  const { Agent } = loadUndiciRuntimeDeps();
  const opts = {
    ...options,
    connect: {
      ...(options?.connect ?? {}),
      alpnProtocols: ['h3', 'h2', 'http/1.1'],
    },
    allowH2: true,
  };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    opts.bodyTimeout = Math.floor(timeoutMs);
    opts.headersTimeout = Math.floor(timeoutMs);
  }
  return new Agent(opts);
}

/**
 * Creates an EnvHttpProxyAgent with HTTP/3 support.
 * Requires Node.js with --experimental-fetch and --experimental-quic flags.
 */
export function createEnvHttp3ProxyAgent(
  options?: UndiciEnvHttpProxyAgentOptions,
  timeoutMs?: number,
): import("undici").EnvHttpProxyAgent {
  const { EnvHttpProxyAgent } = loadUndiciRuntimeDeps();
  const opts = {
    ...options,
    connect: {
      ...(options?.connect ?? {}),
      alpnProtocols: ['h3', 'h2', 'http/1.1'],
    },
    allowH2: true,
  };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    opts.bodyTimeout = Math.floor(timeoutMs);
    opts.headersTimeout = Math.floor(timeoutMs);
  }
  return new EnvHttpProxyAgent(opts);
}

/**
 * Creates a ProxyAgent with HTTP/3 support.
 * Requires Node.js with --experimental-fetch and --experimental-quic flags.
 */
export function createHttp3ProxyAgent(
  options: UndiciProxyAgentOptions,
  timeoutMs?: number,
): import("undici").ProxyAgent {
  const { ProxyAgent } = loadUndiciRuntimeDeps();
  const normalized =
    typeof options === "string" || options instanceof URL
      ? { uri: options.toString() }
      : { ...options };
  const opts = {
    ...normalized,
    connect: {
      ...(normalized?.connect ?? {}),
      alpnProtocols: ['h3', 'h2', 'http/1.1'],
    },
    allowH2: true,
  };
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    opts.bodyTimeout = Math.floor(timeoutMs);
    opts.headersTimeout = Math.floor(timeoutMs);
  }
  return new ProxyAgent(opts);
}