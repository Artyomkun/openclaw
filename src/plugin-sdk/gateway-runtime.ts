// Public gateway/client helpers for plugins that talk to the host gateway surface.

export * from "../gateway/channel-status-patches.ts";
export { addGatewayClientOptions, callGatewayFromCli } from "../cli/gateway-rpc.ts";
export type { GatewayRpcOpts } from "../cli/gateway-rpc.ts";
export { isLoopbackHost } from "../gateway/net.ts";
export { resolveHostedPluginSurfaceUrl } from "../gateway/hosted-plugin-surface-url.ts";
export type { HostedPluginSurfaceUrlParams } from "../gateway/hosted-plugin-surface-url.ts";
export {
  buildPluginNodeCapabilityScopedHostUrl,
  DEFAULT_PLUGIN_NODE_CAPABILITY_TTL_MS,
  mintPluginNodeCapabilityToken,
  normalizePluginNodeCapabilityScopedUrl,
  PLUGIN_NODE_CAPABILITY_PATH_PREFIX,
} from "../gateway/plugin-node-capability.ts";
export type {
  NormalizedPluginNodeCapabilityUrl,
  PluginNodeCapabilitySurface,
} from "../gateway/plugin-node-capability.ts";
export {
  isNodeCommandAllowed,
  resolveNodeCommandAllowlist,
} from "../gateway/node-command-policy.ts";
export type { NodeSession } from "../gateway/node-registry.ts";
export { resolveNodeFromNodeList, resolveNodeIdFromNodeList } from "../shared/node-resolve.ts";
export type { NodeMatchCandidate } from "../shared/node-match.ts";
export {
  respondUnavailableOnNodeInvokeError,
  safeParseJson,
} from "../gateway/server-methods/nodes.helpers.ts";
export type { GatewayRequestHandlers } from "../gateway/server-methods/types.ts";
export { ensureGatewayStartupAuth } from "../gateway/startup-auth.ts";
export { resolveGatewayAuth } from "../gateway/auth.ts";
export { rawDataToString } from "../infra/ws.ts";
export { GatewayClient } from "../gateway/client.ts";
export { startGatewayClientWhenEventLoopReady } from "../gateway/client-start-readiness.ts";
export {
  createOperatorApprovalsGatewayClient,
  withOperatorApprovalsGatewayClient,
} from "../gateway/operator-approvals-client.ts";
export { ErrorCodes, errorShape } from "../../packages/gateway-protocol/src/index.ts";
export type { EventFrame } from "../../packages/gateway-protocol/src/index.ts";
export type { GatewayRequestHandlerOptions } from "../gateway/server-methods/types.ts";
