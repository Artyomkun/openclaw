/**
 * @deprecated Broad public SDK barrel. Prefer focused conversation/thread
 * binding subpaths and avoid adding new imports here.
 */

export {
  createConversationBindingRecord,
  getConversationBindingCapabilities,
  listSessionBindingRecords,
  resolveConversationBindingRecord,
  touchConversationBindingRecord,
  unbindConversationBindingRecord,
} from "../bindings/records.ts";
export {
  ensureConfiguredBindingRouteReady,
  resolveConfiguredBindingRoute,
  type ConfiguredBindingRouteResult,
  resolveRuntimeConversationBindingRoute,
  type RuntimeConversationBindingRouteResult,
} from "../channels/plugins/binding-routing.ts";
export {
  primeConfiguredBindingRegistry,
  resolveConfiguredBinding,
  resolveConfiguredBindingRecord,
  resolveConfiguredBindingRecordBySessionKey,
  resolveConfiguredBindingRecordForConversation,
} from "../channels/plugins/binding-registry.ts";
export {
  ensureConfiguredBindingTargetReady,
  ensureConfiguredBindingTargetSession,
  resetConfiguredBindingTargetInPlace,
} from "../channels/plugins/binding-targets.ts";
export { resolveConversationLabel } from "../channels/conversation-label.ts";
export { recordInboundSession } from "../channels/session.ts";
export { recordInboundSessionMetaSafe } from "../channels/session-meta.ts";
export { resolveThreadBindingConversationIdFromBindingId } from "../channels/thread-binding-id.ts";
export {
  createScopedAccountReplyToModeResolver,
  createStaticReplyToModeResolver,
  createTopLevelChannelReplyToModeResolver,
} from "../channels/plugins/threading-helpers.ts";
export {
  formatThreadBindingDurationLabel,
  resolveThreadBindingFarewellText,
  resolveThreadBindingIntroText,
  resolveThreadBindingThreadName,
} from "../channels/thread-bindings-messages.ts";
export {
  formatThreadBindingDisabledError,
  formatThreadBindingSpawnDisabledError,
  resolveThreadBindingEffectiveExpiresAt,
  resolveThreadBindingIdleTimeoutMs,
  resolveThreadBindingIdleTimeoutMsForChannel,
  resolveThreadBindingLifecycle,
  resolveThreadBindingMaxAgeMs,
  resolveThreadBindingMaxAgeMsForChannel,
  resolveThreadBindingsEnabled,
  resolveThreadBindingSpawnPolicy,
  type ThreadBindingSpawnKind,
  type ThreadBindingSpawnPolicy,
} from "../channels/thread-bindings-policy.ts";
export type {
  ConfiguredBindingConversation,
  ConfiguredBindingResolution,
  CompiledConfiguredBinding,
  StatefulBindingTargetDescriptor,
} from "../channels/plugins/binding-types.ts";
export type {
  StatefulBindingTargetDriver,
  StatefulBindingTargetReadyResult,
  StatefulBindingTargetResetResult,
  StatefulBindingTargetSessionResult,
} from "../channels/plugins/stateful-target-drivers.ts";
export {
  type BindingStatus,
  type BindingTargetKind,
  type ConversationRef,
  SessionBindingError,
  type SessionBindingAdapter,
  type SessionBindingAdapterCapabilities,
  type SessionBindingBindInput,
  type SessionBindingCapabilities,
  type SessionBindingPlacement,
  type SessionBindingRecord,
  type SessionBindingService,
  type SessionBindingUnbindInput,
  getSessionBindingService,
  isSessionBindingError,
  registerSessionBindingAdapter,
  unregisterSessionBindingAdapter,
} from "../infra/outbound/session-binding-service.ts";
export { testing, testing as __testing } from "../infra/outbound/session-binding-service.ts";
export * from "../pairing/pairing-challenge.ts";
export { resolvePairingIdLabel } from "../pairing/pairing-labels.ts";
export * from "../pairing/pairing-messages.ts";
export * from "../pairing/pairing-store.ts";
export {
  buildPluginBindingApprovalCustomId,
  buildPluginBindingDeclinedText,
  buildPluginBindingErrorText,
  buildPluginBindingResolvedText,
  buildPluginBindingUnavailableText,
  detachPluginConversationBinding,
  getCurrentPluginConversationBinding,
  hasShownPluginBindingFallbackNotice,
  isPluginOwnedBindingMetadata,
  isPluginOwnedSessionBindingRecord,
  markPluginBindingFallbackNoticeShown,
  parsePluginBindingApprovalCustomId,
  requestPluginConversationBinding,
  resolvePluginConversationBindingApproval,
  toPluginConversationBinding,
} from "../plugins/conversation-binding.ts";
export { resolvePinnedMainDmOwnerFromAllowlist } from "./channel-access-compat.ts";
