// Channel inbound contracts define plugin ingress payloads and reply dispatch metadata.
export {
  buildChannelInboundEventContext,
  filterChannelInboundQuoteContext,
  filterChannelInboundSupplementalContext,
} from "../channels/inbound-event/context.ts";
export type {
  BuildChannelInboundEventContextParams,
  BuiltChannelInboundEventContext,
} from "../channels/inbound-event/context.ts";
export {
  createInboundDebouncer,
  resolveInboundDebounceMs,
} from "../auto-reply/inbound-debounce.ts";
export {
  createChannelInboundDebouncer,
  shouldDebounceTextInbound,
} from "../channels/inbound-debounce-policy.ts";
export {
  createDirectDmPreCryptoGuardPolicy,
  createPreCryptoDirectDmAuthorizer,
  dispatchInboundDirectDmWithRuntime,
  resolveInboundDirectDmAccessWithRuntime,
} from "../channels/direct-dm.ts";
export type {
  AccessGroupMembershipResolver,
  DirectDmCommandAuthorizationRuntime,
  DirectDmPreCryptoGuardPolicy,
  DirectDmPreCryptoGuardPolicyOverrides,
  ResolvedInboundDirectDmAccess,
} from "../channels/direct-dm.ts";
export {
  formatInboundEnvelope,
  formatInboundFromLabel,
  resolveEnvelopeFormatOptions,
} from "../auto-reply/envelope.ts";
export type { 
  EnvelopeFormatOptions 
} from "../auto-reply/envelope.ts";
export {
  buildMentionRegexes,
  matchesMentionPatterns,
  matchesMentionWithExplicit,
  normalizeMentionText,
} from "../auto-reply/reply/mentions.ts";
export type { 
  BuildMentionRegexesOptions 
} from "../auto-reply/reply/mentions.ts";
export {
  resolveMentionPatternPolicy,
} from "../channels/mention-pattern-policy.ts";
export type {
  ResolveMentionPatternPolicyParams,
  ResolvedMentionPatternPolicy,
} from "../channels/mention-pattern-policy.ts";
export {
  implicitMentionKindWhen,
  resolveInboundMentionDecision,
} from "../channels/mention-gating.ts";
export type {
  InboundImplicitMentionKind,
  InboundMentionDecision,
  InboundMentionFacts,
  InboundMentionPolicy,
  ResolveInboundMentionDecisionNestedParams,
  ResolveInboundMentionDecisionParams,
} from "../channels/mention-gating.ts";
export { 
  formatLocationText, 
  toLocationContext 
} from "../channels/location.ts";
export type { 
  LocationSource, 
  NormalizedLocation 
} from "../channels/location.ts";
export { 
  logInboundDrop 
} from "../channels/logging.ts";
export type { 
  LogFn 
} from "../channels/logging.ts";
export { 
  resolveInboundSessionEnvelopeContext 
} from "../channels/session-envelope.ts";
export {
  classifyChannelInboundEvent,
  resolveUnmentionedGroupInboundPolicy,
} from "../channels/inbound-event/classification.ts";
export type { 
  ClassifyChannelInboundEventParams 
} from "../channels/inbound-event/classification.ts";
export {
  runChannelInboundEvent,
  runPreparedInboundReply,
  dispatchChannelInboundReply,
  recordDroppedChannelInboundHistory,
  dispatchReplyFromConfigWithSettledDispatcher,
  hasFinalInboundReplyDispatch,
  hasVisibleInboundReplyDispatch,
  recordChannelBotPairLoopAndCheckSuppression,
  resolveInboundReplyDispatchCounts,
} from "../channels/message/inbound-reply-dispatch.ts";
export type {
  AssembledInboundReply,
  ChannelBotLoopProtectionFacts,
  ChannelInboundEventRunnerParams,
  ChannelInboundDroppedHistoryOptions,
  PreparedInboundReply,
  InboundReplyDispatchResult,
  InboundReplyRecordOptions,
} from "../channels/message/inbound-reply-dispatch.ts";
export {
  toHistoryMediaEntries,
  toInboundMediaFacts,
  buildChannelInboundMediaPayload,
} from "../channels/inbound-event/media.ts";
export type {
  ChannelInboundMediaInput,
  ChannelInboundMediaPayload,
} from "../channels/inbound-event/media.ts";
export type { 
  InboundEventKind 
} from "../channels/inbound-event/kind.ts";
export type { 
  CommandFacts, 
  InboundMediaFacts, 
  SupplementalContextFacts 
} from "../channels/turn/types.ts";
export {
  createCommandTurnContext,
  isAuthorizedTextSlashCommandTurn,
  isExplicitCommandTurn,
  isNativeCommandTurn,
  isTextSlashCommandTurn,
} from "../auto-reply/command-turn-context.ts";
export type { 
  CommandTurnContext 
} from "../auto-reply/command-turn-context.ts";