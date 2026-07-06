// Public fetch/proxy helpers for plugins that need wrapped fetch behavior.

import type { GuardedFetchOptions } from "../infra/net/fetch-guard.ts";

export { resolveFetch, wrapFetchWithAbortSignal } from "../infra/fetch.ts";
export {
  createHttp1EnvHttpProxyAgent,
  createHttp1ProxyAgent,
} from "../infra/net/undici-runtime.ts";
export {
  addActiveManagedProxyTlsOptions,
  resolveActiveManagedProxyTlsOptions,
} from "../infra/net/proxy/managed-proxy-undici.ts";
export {
  createNodeProxyAgent,
  type CreateNodeProxyAgentOptions,
} from "../infra/net/node-proxy-agent.ts";
export {
  hasEnvHttpProxyConfigured,
  hasEnvHttpProxyAgentConfigured,
  resolveEnvHttpProxyAgentOptions,
  resolveEnvHttpProxyUrl,
  shouldUseEnvHttpProxyForUrl,
} from "../infra/net/proxy-env.ts";
export { getProxyUrlFromFetch, makeProxyFetch } from "../infra/net/proxy-fetch.ts";
export { createPinnedLookup } from "../infra/net/ssrf.ts";
export type { PinnedDispatcherPolicy } from "../infra/net/ssrf.ts";

type GuardedFetchPresetOptions = Omit<
  GuardedFetchOptions,
  "mode" | "proxy" | "dangerouslyAllowEnvProxyWithoutPinnedDns"
>;

/** Apply the trusted-env-proxy guarded fetch preset without exposing raw mode strings to plugins. */
export function withTrustedEnvProxyGuardedFetchMode(
  params: GuardedFetchPresetOptions,
): GuardedFetchOptions {
  return { ...params, mode: "trusted_env_proxy" };
}
