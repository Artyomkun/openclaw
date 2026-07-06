// Hook client-IP config adapts gateway trusted-proxy settings for hook request handling.
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { HookClientIpConfig } from "./hooks-request-handler.ts";

/**
 * Adapts gateway network trust config to the hooks HTTP request handler.
 */
export function resolveHookClientIpConfig(cfg: OpenClawConfig): HookClientIpConfig {
  return {
    trustedProxies: cfg.gateway?.trustedProxies,
    allowRealIpFallback: cfg.gateway?.allowRealIpFallback === true,
  };
}
