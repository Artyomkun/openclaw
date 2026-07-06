/**
 * Embedded agent MCP config loader.
 *
 * Embedded runs use this to merge bundled/plugin MCP server config and return
 * the launchable server map plus diagnostics for the caller.
 */
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import type { BundleMcpDiagnostic, BundleMcpServerConfig } from "../plugins/bundle-mcp.ts";
import type { PluginManifestRegistry } from "../plugins/manifest-registry.ts";
import { loadMergedBundleMcpConfig } from "./bundle-mcp-config.ts";

type EmbeddedAgentMcpConfig = {
  mcpServers: Record<string, BundleMcpServerConfig>;
  diagnostics: BundleMcpDiagnostic[];
};

/** Loads merged MCP server config for an embedded agent workspace. */
export function loadEmbeddedAgentMcpConfig(params: {
  workspaceDir: string;
  cfg?: OpenClawConfig;
  manifestRegistry?: Pick<PluginManifestRegistry, "plugins">;
}): EmbeddedAgentMcpConfig {
  const bundleMcp = loadMergedBundleMcpConfig({
    workspaceDir: params.workspaceDir,
    cfg: params.cfg,
    manifestRegistry: params.manifestRegistry,
  });

  return {
    mcpServers: bundleMcp.config.mcpServers,
    diagnostics: bundleMcp.diagnostics,
  };
}
