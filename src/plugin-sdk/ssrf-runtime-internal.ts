// Private helper surface for bundled plugins with configured local IPC.
// Keep managed proxy bypass capabilities out of the public plugin SDK surface.

export { fetchConfiguredLocalOriginWithSsrFGuard } from "../infra/net/fetch-guard.ts";
export { registerManagedProxyBrowserCdpBypass } from "../infra/net/proxy/proxy-lifecycle.ts";
