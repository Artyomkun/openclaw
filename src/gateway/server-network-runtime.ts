// Gateway network runtime bootstrap.
// Installs process-wide outbound network/proxy configuration before server fetches.
import { ensureGlobalUndiciEnvProxyDispatcher } from "../infra/net/undici-global-dispatcher.ts";

/** Applies process-wide gateway network runtime setup. */
export function bootstrapGatewayNetworkRuntime(): void {
  ensureGlobalUndiciEnvProxyDispatcher();
}
