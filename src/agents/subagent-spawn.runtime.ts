/**
 * Runtime dependency barrel for subagent spawning. Keeping these imports in a
 * single module lets spawn tests replace runtime seams without loading the
 * entire gateway/channel stack.
 */
export {
  DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT,
  DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH,
} from "../config/agent-limits.ts";
export { getRuntimeConfig } from "../config/config.ts";
export { loadSessionStore, mergeSessionEntry, updateSessionStore } from "../config/sessions.ts";
export {
  forkSessionEntryFromParent,
  forkSessionFromParent,
  resolveParentForkDecision,
  type ParentForkDecision,
} from "../auto-reply/reply/session-fork.ts";
export { ensureContextEnginesInitialized } from "../context-engine/init.ts";
export { resolveContextEngine } from "../context-engine/registry.ts";
export { callGateway } from "../gateway/call.ts";
export {
  dispatchGatewayMethodInProcess,
  hasInProcessGatewayContext,
} from "../gateway/server-plugins.ts";
export { ADMIN_SCOPE, isAdminOnlyMethod } from "../gateway/method-scopes.ts";
export { getSessionBindingService } from "../infra/outbound/session-binding-service.ts";
export { getGlobalHookRunner } from "../plugins/hook-runner-global.ts";
export { emitSessionLifecycleEvent } from "../sessions/session-lifecycle-events.ts";
export {
  mergeDeliveryContext,
  normalizeDeliveryContext,
} from "../utils/delivery-context.shared.ts";
export { resolveAgentConfig } from "./agent-scope.ts";
export { AGENT_LANE_SUBAGENT } from "./lanes.ts";
export { resolveSandboxRuntimeStatus } from "./sandbox/runtime-status.ts";
export { buildSubagentSystemPrompt } from "./subagent-system-prompt.ts";
export {
  resolveDisplaySessionKey,
  resolveInternalSessionKey,
  resolveMainSessionAlias,
} from "./tools/sessions-helpers.ts";
