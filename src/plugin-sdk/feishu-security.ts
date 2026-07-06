// Manual facade. Keep loader boundary explicit.
import type { OpenClawConfig } from "../config/types.ts";
import type { SecurityAuditFinding } from "../security/audit.types.ts";
import { loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader.ts";

type SecuritySurface = {
  collectFeishuSecurityAuditFindings: (params: { cfg: OpenClawConfig }) => SecurityAuditFinding[];
};

function loadSecuritySurface(): SecuritySurface {
  return loadBundledPluginPublicSurfaceModuleSync<SecuritySurface>({
    dirName: "feishu",
    artifactBasename: "security-contract-api.js",
  });
}

/** Collect Feishu plugin security findings through the lazy bundled-plugin facade. */
export const collectFeishuSecurityAuditFindings: SecuritySurface["collectFeishuSecurityAuditFindings"] =
  ((...args) =>
    loadSecuritySurface().collectFeishuSecurityAuditFindings(
      ...args,
    )) as SecuritySurface["collectFeishuSecurityAuditFindings"];
