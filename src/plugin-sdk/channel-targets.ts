/**
 * Public SDK subpath for channel target parsing, matching, and allowlist helpers.
 */
export {
  applyChannelMatchMeta,
  buildChannelKeyCandidates,
  normalizeChannelSlug,
  resolveChannelEntryMatch,
  resolveChannelEntryMatchWithFallback,
  resolveChannelMatchConfig,
  resolveNestedAllowlistDecision,
  type ChannelEntryMatch,
  type ChannelMatchSource,
} from "../channels/channel-config.ts";
export {
  buildMessagingTarget,
  ensureTargetId,
  normalizeTargetId,
  parseAtUserTarget,
  parseMentionPrefixOrAtUserTarget,
  parseTargetMention,
  parseTargetPrefix,
  parseTargetPrefixes,
  requireTargetKind,
  type MessagingTarget,
  type MessagingTargetKind,
  type MessagingTargetParseOptions,
} from "../channels/targets.ts";
export {
  createAllowedChatSenderMatcher,
  parseChatAllowTargetPrefixes,
  parseChatTargetPrefixesOrThrow,
  resolveServicePrefixedAllowTarget,
  resolveServicePrefixedChatTarget,
  resolveServicePrefixedOrChatAllowTarget,
  resolveServicePrefixedTarget,
  type ChatSenderAllowParams,
  type ChatTargetPrefixesParams,
  type ParsedChatAllowTarget,
  type ParsedChatTarget,
  type ServicePrefix,
} from "../channels/plugins/chat-target-prefixes.ts";
export type { ChannelId } from "../channels/plugins/types.public.ts";
export { normalizeChannelId } from "../channels/plugins/registry.ts";
export { resolveChannelTtsVoiceDelivery } from "../channels/plugins/tts-capabilities.ts";
export {
  buildUnresolvedTargetResults,
  resolveTargetsWithOptionalToken,
} from "../channels/plugins/target-resolvers.ts";
