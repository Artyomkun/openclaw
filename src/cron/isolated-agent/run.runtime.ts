// Runtime dependency facade for isolated cron agent turns.
export {
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
  type ResolvedAgentConfig,
} from "../../agents/agent-scope-config.ts";
export { resolveCronStyleNow } from "../../agents/current-time.ts";
export { DEFAULT_CONTEXT_TOKENS } from "../../agents/defaults.ts";
export { isCliProvider } from "../../agents/model-selection-cli.ts";
export { resolveThinkingDefault } from "../../agents/model-thinking-default.ts";
export { resolveAgentTimeoutMs } from "../../agents/timeout.ts";
export { deriveSessionTotalTokens, hasNonzeroUsage } from "../../agents/usage.ts";
export { DEFAULT_IDENTITY_FILENAME, ensureAgentWorkspace } from "../../agents/workspace.ts";
export {
  isThinkingLevelSupported,
  normalizeThinkLevel,
  resolveSupportedThinkingLevel,
} from "../../auto-reply/thinking.ts";
export { resolveSessionTranscriptPath } from "../../config/sessions/paths.ts";
export { setSessionRuntimeModel } from "../../config/sessions/types.ts";
export { logWarn } from "../../logger.ts";
export { normalizeAgentId } from "../../routing/session-key.ts";
export {
  isExternalHookSession,
  mapHookExternalContentSource,
  resolveHookExternalContentSource,
} from "../../security/external-content-source.ts";
