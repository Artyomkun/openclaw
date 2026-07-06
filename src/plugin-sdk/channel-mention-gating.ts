// Plugin SDK barrel for mention-gating policy helpers used by channel plugins.
export type {
  InboundImplicitMentionKind,
  InboundMentionDecision,
  InboundMentionFacts,
  InboundMentionPolicy,
  ResolveInboundMentionDecisionNestedParams,
  ResolveInboundMentionDecisionParams,
} from "../channels/mention-gating.ts";
export {
  implicitMentionKindWhen,
  resolveInboundMentionDecision,
} from "../channels/mention-gating.ts";
export {
  CURRENT_MESSAGE_MARKER,
  buildMentionRegexes,
  normalizeMentionText,
  type BuildMentionRegexesOptions,
} from "../auto-reply/reply/mentions.ts";
export {
  resolveMentionPatternPolicy,
  type ResolveMentionPatternPolicyParams,
  type ResolvedMentionPatternPolicy,
} from "../channels/mention-pattern-policy.ts";
