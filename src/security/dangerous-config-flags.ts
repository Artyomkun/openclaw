// Collects dangerous config flag findings across agents and runtime config.
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { collectPluginConfigContractMatches } from "../plugins/config-contract-matches.ts";
import { resolvePluginConfigContractsById } from "../plugins/config-contracts.ts";
import { isRecord } from "../utils.ts";
import { collectEnabledInsecureOrDangerousFlagsFromContracts } from "./dangerous-config-flags-core.ts";
import { collectEnabledInsecureOrDangerousFlagsFromCurrentSnapshot } from "./dangerous-config-flags-current.ts";

/**
 * Collect enabled insecure/dangerous config flags for audit warnings and gateway tool previews.
 * Plugin flags use current metadata when requested, then fall back to resolving manifest contracts.
 */
export function collectEnabledInsecureOrDangerousFlags(
  cfg: OpenClawConfig,
  options: { preferCurrentPluginMetadataSnapshot?: boolean } = {},
): string[] {
  const pluginEntries = cfg.plugins?.entries;
  if (!isRecord(pluginEntries)) {
    return collectEnabledInsecureOrDangerousFlagsFromContracts(cfg);
  }
  const pluginIds = Object.keys(pluginEntries);

  if (options.preferCurrentPluginMetadataSnapshot) {
    const currentSnapshotFlags = collectEnabledInsecureOrDangerousFlagsFromCurrentSnapshot(cfg);
    if (currentSnapshotFlags) {
      return currentSnapshotFlags;
    }
  }

  const configContracts = resolvePluginConfigContractsById({
    config: cfg,
    workspaceDir: resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg)),
    env: process.env,
    pluginIds,
  });
  return collectEnabledInsecureOrDangerousFlagsFromContracts(cfg, {
    collectPluginConfigContractMatches,
    configContractsById: configContracts,
  });
}
