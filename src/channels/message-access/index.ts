// Public channel ingress/message-access barrel. Keep this as the narrow import
// point for callers that need access decisions without plugin internals.
export { decideChannelIngress } from "./decision.ts";
export { defineStableChannelIngressIdentity } from "./runtime-identity.ts";
export {
  channelIngressRoutes,
  createChannelIngressResolver,
  resolveChannelMessageIngress,
  resolveStableChannelMessageIngress,
} from "./runtime.ts";
export { readChannelIngressStoreAllowFromForDmPolicy } from "./store-allow-from.ts";
export { resolveChannelIngressEffectiveAllowFromLists } from "./effective-allow-from.ts";
export { resolveChannelIngressState } from "./state.ts";
export type {
  ChannelIngressAccessGroupMembershipResolver,
  ChannelIngressCommandPresetInput,
  ChannelIngressConfigInput,
  ChannelIngressEventPresetInput,
  ChannelIngressIdentityAlias,
  ChannelIngressIdentityDescriptor,
  ChannelIngressIdentityField,
  ChannelIngressIdentitySubjectInput,
  ChannelIngressRouteAccess,
  ChannelIngressRouteDescriptor,
  ChannelIngressResolver,
  ChannelIngressResolverMessageParams,
  ChannelMessageIngressCommandInput,
  CreateChannelIngressResolverParams,
  ResolvedChannelMessageIngress,
  ResolveChannelMessageIngressParams,
  ResolveStableChannelMessageIngressParams,
  StableChannelIngressIdentityParams,
} from "./runtime-types.ts";
export type * from "./types.ts";
