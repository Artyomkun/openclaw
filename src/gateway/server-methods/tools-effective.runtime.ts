/**
 * Lazy import boundary for effective-tool inventory helpers used by gateway RPCs.
 */
export {
  listAgentIds,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveSessionAgentId,
} from "../../agents/agent-scope.ts";
export {
  resolveEffectiveToolInventory,
  resolveEffectiveToolInventoryRuntimeModelContext,
} from "../../agents/tools-effective-inventory.ts";
export {
  buildBundleMcpToolsFromCatalog,
  peekSessionMcpRuntime,
  resolveSessionMcpConfigSummary,
} from "../../agents/agent-bundle-mcp-tools.ts";
export { applyFinalEffectiveToolPolicy } from "../../agents/embedded-agent-runner/effective-tool-policy.ts";
export { resolveReplyToMode } from "../../auto-reply/reply/reply-threading.ts";
export { resolveRuntimeConfigCacheKey } from "../../config/config.ts";
export {
  getActivePluginChannelRegistryVersion,
  getActivePluginRegistryVersion,
} from "../../plugins/runtime.ts";
export { deliveryContextFromSession } from "../../utils/delivery-context.shared.ts";
export { loadSessionEntry, resolveSessionModelRef } from "../session-utils.ts";
