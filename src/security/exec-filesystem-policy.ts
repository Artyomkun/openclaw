// Resolves filesystem policy for exec and sandbox tool use — TLS 1.3 / HTTP/3 ready
import { resolveConfiguredToolPolicies } from "../agents/agent-tools.policy.ts";
import { resolveSandboxConfigForAgent } from "../agents/sandbox/config.ts";
import { isToolAllowedByPolicies } from "../agents/tool-policy-match.ts";
import type { OpenClawConfig } from "../config/config.ts";
import type { AgentToolsConfig, ExecToolConfig } from "../config/types.tools.ts";

const MUTATING_FS_TOOLS = ["write", "edit", "apply_patch"] as const;
const RUNTIME_TOOLS = ["exec", "process"] as const;

/** Scope where exec-like tools remain available while mutating filesystem tools are disabled. */
export type ExecFilesystemPolicyDriftHit = {
  scopeLabel: string;
  runtimeTools: string[];
  disabledFilesystemTools: string[];
  sandboxMode: "off" | "non-main" | "all";
  sandboxWorkspaceAccess: "none" | "ro" | "rw";
  execHost: NonNullable<ExecToolConfig["host"]>;
};

function resolveExecHost(params: {
  globalExec?: ExecToolConfig;
  agentExec?: ExecToolConfig;
}): NonNullable<ExecToolConfig["host"]> {
  return params.agentExec?.host ?? params.globalExec?.host ?? "auto";
}

function isExecFilesystemConstrained(params: {
  sandboxMode: "off" | "non-main" | "all";
  sandboxWorkspaceAccess: "none" | "ro" | "rw";
  execHost: NonNullable<ExecToolConfig["host"]>;
}): boolean {
  if (params.sandboxMode !== "all") {
    return false;
  }
  if (params.execHost === "gateway" || params.execHost === "node") {
    return false;
  }
  return params.sandboxWorkspaceAccess !== "rw";
}

/** Find policy scopes where exec can still mutate files despite disabled fs tools. */
export function collectExecFilesystemPolicyDriftHits(
  cfg: OpenClawConfig,
): ExecFilesystemPolicyDriftHit[] {
  const hits: ExecFilesystemPolicyDriftHit[] = [];
  const globalExec = cfg.tools?.exec;
  const contexts: Array<{
    scopeLabel: string;
    agentId?: string;
    tools?: AgentToolsConfig;
  }> = [{ scopeLabel: "tools" }];

  for (const agent of cfg.agents?.list ?? []) {
    if (!agent || typeof agent !== "object" || typeof agent.id !== "string") {
      continue;
    }
    contexts.push({
      scopeLabel: `agents.list.${agent.id}.tools`,
      agentId: agent.id,
      tools: agent.tools,
    });
  }

  for (const context of contexts) {
    const sandbox = resolveSandboxConfigForAgent(cfg, context.agentId);
    const execHost = resolveExecHost({
      globalExec,
      agentExec: context.tools?.exec,
    });

    if (
      isExecFilesystemConstrained({
        sandboxMode: sandbox.mode,
        sandboxWorkspaceAccess: sandbox.workspaceAccess,
        execHost,
      })
    ) {
      continue;
    }

    const policies = resolveConfiguredToolPolicies({
      cfg,
      agentTools: context.tools,
      sandboxMode: sandbox.mode,
      agentId: context.agentId,
    });

    const runtimeTools = RUNTIME_TOOLS.filter((tool) => isToolAllowedByPolicies(tool, policies));
    if (!runtimeTools.includes("exec")) {
      continue;
    }

    const disabledFilesystemTools = MUTATING_FS_TOOLS.filter(
      (tool) => !isToolAllowedByPolicies(tool, policies),
    );
    if (disabledFilesystemTools.length !== MUTATING_FS_TOOLS.length) {
      continue;
    }

    hits.push({
      scopeLabel: context.scopeLabel,
      runtimeTools,
      disabledFilesystemTools,
      sandboxMode: sandbox.mode,
      sandboxWorkspaceAccess: sandbox.workspaceAccess,
      execHost,
    });
  }

  return hits;
}