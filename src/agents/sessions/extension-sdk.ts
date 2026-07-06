/**
 * Extension-safe session SDK surface.
 *
 * Keep this barrel free of the session runtime and resource loader. The
 * extension loader imports it to virtualize `openclaw/plugin-sdk/agent-sessions`,
 * so importing loader-owned modules here creates runtime cycles.
 */

export { getAgentDir, VERSION } from "../config.ts";
export * from "./auth-storage.ts";
export * from "./bash-executor.ts";
export * from "./compaction/index.ts";
export * from "./event-bus.ts";
export type { ReadonlyFooterDataProvider } from "./footer-data-provider.ts";
export { convertToLlm } from "./messages.ts";
export * from "./model-registry.ts";
export * from "./model-resolver.ts";
export * from "./package-manager.ts";
export type { PromptTemplate } from "./prompt-templates.ts";
export type { ResourceCollision, ResourceDiagnostic } from "./diagnostics.ts";
export * from "./session-manager.ts";
export {
  FileSettingsStorage,
  InMemorySettingsStorage,
  SettingsManager,
  type BranchSummarySettings,
  type ImageSettings,
  type MarkdownSettings,
  type PackageSource,
  type ProviderRetrySettings,
  type RetrySettings,
  type Settings,
  type SettingsError,
  type SettingsScope,
  type SettingsStorage,
  type TerminalSettings,
  type ThinkingBudgetsSettings,
  type TransportSetting,
  type WarningSettings,
} from "./settings-manager.ts";
export type { Skill } from "../../skills/loading/session.ts";
export * from "./source-info.ts";
export * from "./tools/index.ts";
export type * from "./extensions/types.ts";
export {
  defineTool,
  isBashToolResult,
  isEditToolResult,
  isFindToolResult,
  isGrepToolResult,
  isLsToolResult,
  isReadToolResult,
  isToolCallEventType,
  isWriteToolResult,
} from "./extensions/types.ts";
export { wrapRegisteredTool, wrapRegisteredTools } from "./extensions/wrapper.ts";
