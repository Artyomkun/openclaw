/**
 * Runtime dependency barrel for subagent announcement delivery.
 *
 * Tests mock this module to isolate delivery logic from gateway, outbound
 * message routing, queue settings, hooks, and embedded-run state.
 */
export { getRuntimeConfig } from "../config/config.ts";
export {
  loadSessionStore,
  resolveAgentIdFromSessionKey,
  resolveStorePath,
} from "../config/sessions.ts";
export { callGateway } from "../gateway/call.ts";
export { dispatchGatewayMethodInProcess } from "../gateway/server-plugins.ts";
export { resolveQueueSettings } from "../auto-reply/reply/queue.ts";
export { resolveExternalBestEffortDeliveryTarget } from "../infra/outbound/best-effort-delivery.ts";
export { sendMessage } from "../infra/outbound/message.ts";
export { createBoundDeliveryRouter } from "../infra/outbound/bound-delivery-router.ts";
export { resolveConversationIdFromTargets } from "../infra/outbound/conversation-id.ts";
export { getGlobalHookRunner } from "../plugins/hook-runner-global.ts";
export {
  formatEmbeddedAgentQueueFailureSummary,
  isEmbeddedAgentRunActive,
  isEmbeddedRunAbandoned,
  queueEmbeddedAgentMessageWithOutcomeAsync,
  resolveActiveEmbeddedRunSessionId,
} from "./embedded-agent-runner/runs.ts";
