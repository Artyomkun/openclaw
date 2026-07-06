// Text-mode status runtime barrel.
// Kept separate from command orchestration so JSON/fast status does not import table/theme helpers.

export { formatCliCommand } from "../cli/command-format.ts";
export { info } from "../globals.ts";
export { formatTimeAgo } from "../infra/format-time/format-relative.ts";
export { formatGitInstallLabel } from "../infra/update-check.ts";
export {
  resolveMemoryCacheSummary,
  resolveMemoryFtsState,
  resolveMemoryVectorState,
} from "../memory-host-sdk/status.ts";
export {
  formatPluginCompatibilityNotice,
  summarizePluginCompatibility,
} from "../plugins/status.ts";
export { getTerminalTableWidth, renderTable } from "../../packages/terminal-core/src/table.ts";
export { theme } from "../../packages/terminal-core/src/theme.ts";
export { formatHealthChannelLines } from "./health-format.ts";
export { groupChannelIssuesByChannel } from "./status-all/channel-issues.ts";
export {
  buildStatusChannelsTableRows,
  statusChannelsTableColumns,
} from "./status-all/channels-table.ts";
export {
  buildStatusGatewaySurfaceValues,
  buildStatusOverviewSurfaceRows,
  buildStatusOverviewRows,
  buildStatusUpdateSurface,
  buildGatewayStatusSummaryParts,
  formatStatusDashboardValue,
  formatGatewayAuthUsed,
  formatGatewaySelfSummary,
  resolveStatusUpdateChannelInfo,
  formatStatusServiceValue,
  formatStatusTailscaleValue,
  resolveStatusDashboardUrl,
} from "./status-all/format.ts";
export {
  formatDuration,
  formatKTokens,
  formatPromptCacheCompact,
  formatTokensCompact,
  shortenText,
} from "./status.format.ts";
export { formatUpdateAvailableHint } from "./status.update.ts";
