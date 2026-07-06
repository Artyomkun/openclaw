/**
 * Runtime SDK subpath for native approval routing, target matching, and forwarding gates.
 */
export {
  createChannelApprovalForwardingEvaluator,
  createChannelApproverDmTargetResolver,
  createChannelNativeOriginTargetResolver,
  createNativeApprovalChannelRouteGates,
  createNativeApprovalForwardingFallbackSuppressor,
  nativeApprovalTargetsMatch,
  resolveApprovalKind,
  shouldSuppressLocalNativeExecApprovalPrompt,
  type ChannelApprovalExplicitTargetEligibilityParams,
  type ChannelApprovalForwardingEligibilityParams,
  type ChannelApprovalPotentialRouteParams,
} from "./approval-native-helpers.ts";
export {
  resolveApprovalRequestSessionConversation,
  resolveApprovalRequestOriginTarget,
  resolveApprovalRequestSessionTarget,
  resolveExecApprovalSessionTarget,
  type ApprovalRequestSessionConversation,
  type ExecApprovalSessionTarget,
} from "../infra/exec-approval-session-target.ts";
export { buildChannelApprovalNativeTargetKey } from "../infra/approval-native-target-key.ts";
export {
  doesApprovalRequestMatchChannelAccount,
  resolveApprovalRequestAccountId,
  resolveApprovalRequestChannelAccountId,
} from "../infra/approval-request-account-binding.ts";
