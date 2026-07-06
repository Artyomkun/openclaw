/** Non-deep audit facade for cheap summary/config findings. */
export {
  collectAttackSurfaceSummaryFindings,
  collectSmallModelRiskFindings,
} from "./audit-extra.summary.ts";

export {
  collectExposureMatrixFindings,
  collectGatewayHttpNoAuthFindings,
  collectGatewayHttpSessionKeyOverrideFindings,
  collectHooksHardeningFindings,
  collectLikelyMultiUserSetupFindings,
  collectMinimalProfileOverrideFindings,
  collectModelHygieneFindings,
  collectNodeDangerousAllowCommandFindings,
  collectNodeDenyCommandPatternFindings,
  collectSandboxDangerousConfigFindings,
  collectSandboxDockerNoopFindings,
  collectSecretsInConfigFindings,
  collectSyncedFolderFindings,
} from "./audit-extra.sync.ts";

export {
  collectSandboxBrowserHashLabelFindings,
  collectIncludeFilePermFindings,
  collectStateDeepFilesystemFindings,
  readConfigSnapshotForAudit,
} from "./audit-extra.async.ts";
export { collectWorkspaceSkillSymlinkEscapeFindings } from "../skills/security/workspace-audit.ts";
export { collectPluginsTrustFindings } from "./audit-plugins-trust.ts";
