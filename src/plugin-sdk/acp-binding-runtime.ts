// Narrow ACP binding helpers for plugins that need persistent ACP setup state
// without importing the broad core SDK surface.

export { ensureConfiguredAcpBindingReady } from "../acp/persistent-bindings.lifecycle.ts";
export { resolveConfiguredAcpBindingRecord } from "../acp/persistent-bindings.resolve.ts";
