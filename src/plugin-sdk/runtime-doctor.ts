/**
 * Runtime SDK subpath for plugin doctor migrations, compat checks, and uninstall helpers.
 */
export { collectProviderDangerousNameMatchingScopes } from "../config/dangerous-name-matching.ts";
export { asObjectRecord } from "../config/channel-compat-normalization.ts";
export type { CompatMutationResult } from "../config/channel-compat-normalization.ts";
export {
  detectPluginInstallPathIssue,
  formatPluginInstallPathIssue,
} from "../infra/plugin-install-path-warnings.ts";
export type {
  OpenKeyedStoreOptions,
  PluginStateKeyedStore,
} from "../plugin-state/plugin-state-store.ts";
export { createPluginStateSyncKeyedStore } from "../plugin-state/plugin-state-store.ts";
export { removePluginFromConfig } from "../plugins/uninstall.ts";
export type {
  PluginDoctorStateMigration,
  PluginDoctorStateMigrationContext,
} from "../plugins/doctor-contract-registry.ts";
export type { DoctorSessionRouteStateOwner } from "../plugins/doctor-session-route-state-owner-types.ts";
