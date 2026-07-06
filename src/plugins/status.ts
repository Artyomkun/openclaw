// Plugin status report — simplified
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.ts";
import { getRuntimeConfig } from "../config/config.ts";
import { loadOpenClawPlugins } from "./loader.ts";
import type { PluginRegistry } from "./registry.ts";
import { buildPluginRuntimeLoadOptions } from "./runtime/load-context.ts";

export type PluginStatusReport = PluginRegistry & {
  workspaceDir?: string;
};

export type PluginInspectReport = {
  pluginId: string;
  name: string;
  version?: string;
  enabled: boolean;
  origin: string;
  status: string;
  hooks: number;
  commands: string[];
  diagnostics: string[];
};

function getWorkspaceDir(config: any, env?: NodeJS.ProcessEnv): string {
  return resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config), env);
}

export function buildPluginStatusReport(params?: {
  config?: any;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): PluginStatusReport {
  const config = params?.config ?? getRuntimeConfig();
  const workspaceDir = params?.workspaceDir ?? getWorkspaceDir(config, params?.env);

  const registry = loadOpenClawPlugins(
    buildPluginRuntimeLoadOptions({
      config,
      env: params?.env ?? process.env,
      workspaceDir,
      loadModules: false,
      activate: false,
      cache: false,
    })
  );

  return {
    workspaceDir,
    ...registry,
  };
}

export function inspectPlugin(
  pluginId: string,
  params?: {
    config?: any;
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
  }
): PluginInspectReport | null {
  const report = buildPluginStatusReport(params);
  const plugin = report.plugins.find((p) => p.id === pluginId);

  if (!plugin) return null;

  const diagnostics = report.diagnostics
    .filter((d) => d.pluginId === pluginId)
    .map((d) => d.message);

  return {
    pluginId: plugin.id,
    name: plugin.name ?? plugin.id,
    version: plugin.version,
    enabled: plugin.enabled,
    origin: plugin.origin,
    status: plugin.status,
    hooks: report.hooks.filter((h) => h.pluginId === pluginId).length,
    commands: plugin.commands ?? [],
    diagnostics,
  };
}

export function listAllPlugins(params?: {
  config?: any;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): PluginInspectReport[] {
  const report = buildPluginStatusReport(params);
  return report.plugins
    .map((plugin) => inspectPlugin(plugin.id, params))
    .filter((p): p is PluginInspectReport => p !== null);
}