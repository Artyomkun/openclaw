// Narrow shared secret-ref helpers for plugin config and secret-contract paths.

export { coerceSecretRef } from "../config/types.secrets.ts";
export type { SecretInput, SecretRef } from "../config/types.secrets.ts";
export { resolveSecretRefValues } from "../secrets/resolve.ts";
export { applyResolvedAssignments, createResolverContext } from "../secrets/runtime-shared.ts";
