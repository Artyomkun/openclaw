/**
 * Public SDK subpath for session keys, account bindings, and message-channel routing.
 */
export {
  buildAgentSessionKey,
  deriveLastRoutePolicy,
  resolveAgentRoute,
  resolveInboundLastRouteSessionKey,
  type ResolvedAgentRoute,
  type RoutePeer,
  type RoutePeerKind,
} from "../routing/resolve-route.ts";
export {
  buildAgentMainSessionKey,
  DEFAULT_ACCOUNT_ID,
  DEFAULT_MAIN_KEY,
  buildGroupHistoryKey,
  isCronSessionKey,
  isAcpSessionKey,
  isSubagentSessionKey,
  normalizeAccountId,
  normalizeAgentId,
  normalizeMainKey,
  normalizeOptionalAccountId,
  parseAgentSessionKey,
  parseThreadSessionSuffix,
  resolveAgentIdFromSessionKey,
  resolveThreadSessionKeys,
  sanitizeAgentId,
} from "../routing/session-key.ts";
export { resolveAccountEntry } from "../routing/account-lookup.ts";
export { listBoundAccountIds, resolveDefaultAgentBoundAccountId } from "../routing/bindings.ts";
export {
  formatSetExplicitDefaultInstruction,
  formatSetExplicitDefaultToConfiguredInstruction,
} from "../routing/default-account-warnings.ts";
export { buildOutboundBaseSessionKey } from "../infra/outbound/base-session-key.ts";
export { normalizeOutboundThreadId } from "../infra/outbound/thread-id.ts";
export { normalizeMessageChannel, resolveGatewayMessageChannel } from "../utils/message-channel.ts";
