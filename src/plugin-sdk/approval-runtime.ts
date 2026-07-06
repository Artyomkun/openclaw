// Approval request/reply helpers for exec and plugin approval flows.

export {
  DEFAULT_EXEC_APPROVAL_TIMEOUT_MS,
  resolveExecApprovalAllowedDecisions,
  resolveExecApprovalRequestAllowedDecisions,
  type ExecApprovalDecision,
  type ExecApprovalRequest,
  type ExecApprovalRequestPayload,
  type ExecApprovalResolved,
  type ExecHost,
} from "../infra/exec-approvals.ts";
export {
  buildExecApprovalPendingReplyPayload,
  getExecApprovalApproverDmNoticeText,
  getExecApprovalReplyMetadata,
  type ExecApprovalPendingReplyParams,
  type ExecApprovalReplyDecision,
  type ExecApprovalReplyMetadata,
} from "../infra/exec-approval-reply.ts";
export { resolveExecApprovalCommandDisplay } from "../infra/exec-approval-command-display.ts";
export { formatApprovalDisplayPath } from "../infra/approval-display-paths.ts";
export {
  createChannelApproverDmTargetResolver,
  createChannelNativeOriginTargetResolver,
} from "./approval-native-helpers.ts";
export {
  resolveApprovalRequestOriginTarget,
  resolveApprovalRequestSessionTarget,
  resolveExecApprovalSessionTarget,
  type ExecApprovalSessionTarget,
} from "../infra/exec-approval-session-target.ts";
export {
  doesApprovalRequestMatchChannelAccount,
  resolveApprovalRequestAccountId,
  resolveApprovalRequestChannelAccountId,
} from "../infra/approval-request-account-binding.ts";
export {
  buildPluginApprovalExpiredMessage,
  buildPluginApprovalRequestMessage,
  buildPluginApprovalResolvedMessage,
  DEFAULT_PLUGIN_APPROVAL_TIMEOUT_MS,
  MAX_PLUGIN_APPROVAL_TIMEOUT_MS,
  type PluginApprovalRequest,
  type PluginApprovalRequestPayload,
  type PluginApprovalResolved,
} from "../infra/plugin-approvals.ts";
export { createResolvedApproverActionAuthAdapter } from "./approval-auth-helpers.ts";
export {
  createChannelExecApprovalProfile,
  isChannelExecApprovalClientEnabledFromConfig,
  isChannelExecApprovalTargetRecipient,
} from "./approval-client-helpers.ts";
export { createChannelNativeApprovalRuntime } from "../infra/approval-native-runtime.ts";
export {
  createApproverRestrictedNativeApprovalAdapter,
  createApproverRestrictedNativeApprovalCapability,
  createChannelApprovalCapability,
  splitChannelApprovalCapability,
} from "./approval-delivery-helpers.ts";
export { resolveApprovalApprovers } from "./approval-approvers.ts";
export {
  matchesApprovalRequestFilters,
  matchesApprovalRequestSessionFilter,
  type ApprovalRequestFilterInput,
} from "../infra/approval-request-filters.ts";
export {
  buildApprovalPendingReplyPayload,
  buildApprovalResolvedReplyPayload,
  buildPluginApprovalPendingReplyPayload,
  buildPluginApprovalResolvedReplyPayload,
} from "./approval-renderers.ts";
