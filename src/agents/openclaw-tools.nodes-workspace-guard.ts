/**
 * Workspace guard adapter for the nodes tool.
 *
 * Applies the shared output-path guard only when filesystem policy requires workspace-only writes.
 */
import { wrapToolWorkspaceRootGuardWithOptions } from "./agent-tools.read.ts";
import type { ToolFsPolicy } from "./tool-fs-policy.ts";
import type { AnyAgentTool } from "./tools/common.ts";

/** Wraps the nodes tool with a workspace-only output-path guard when policy requires it. */
export function applyNodesToolWorkspaceGuard(
  nodesToolBase: AnyAgentTool,
  options: {
    fsPolicy?: ToolFsPolicy;
    sandboxContainerWorkdir?: string;
    sandboxRoot?: string;
    workspaceDir: string;
  },
): AnyAgentTool {
  if (options.fsPolicy?.workspaceOnly !== true) {
    return nodesToolBase;
  }
  return wrapToolWorkspaceRootGuardWithOptions(
    nodesToolBase,
    options.sandboxRoot ?? options.workspaceDir,
    {
      containerWorkdir: options.sandboxContainerWorkdir,
      normalizeGuardedPathParams: true,
      pathParamKeys: ["outPath"],
    },
  );
}
