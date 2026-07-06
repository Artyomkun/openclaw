// Narrow shared secret-contract exports for non-TTS channel/plugin secret surfaces.

export {
  collectConditionalChannelFieldAssignments,
  collectNestedChannelFieldAssignments,
  collectSimpleChannelFieldAssignments,
  getChannelRecord,
  getChannelSurface,
  hasConfiguredSecretInputValue,
  isBaseFieldActiveForChannelSurface,
  normalizeSecretStringValue,
  resolveChannelAccountSurface,
} from "../secrets/channel-secret-basic-runtime.ts";
export type {
  ChannelAccountEntry,
  ChannelAccountPredicate,
  ChannelAccountSurface,
} from "../secrets/channel-secret-basic-runtime.ts";
export {
  collectSecretInputAssignment,
  hasOwnProperty,
  isEnabledFlag,
  pushAssignment,
  pushInactiveSurfaceWarning,
  pushWarning,
} from "../secrets/runtime-shared.ts";
export type { ResolverContext, SecretDefaults } from "../secrets/runtime-shared.ts";
export { isRecord } from "../secrets/shared.ts";
export type { SecretTargetRegistryEntry } from "../secrets/target-registry-types.ts";
