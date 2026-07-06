/**
 * Public Bash/process tool barrel.
 * Implementation lives in focused exec, process, schema, and description
 * modules to keep host policy seams local.
 */
export type {
  BashSandboxConfig,
  ExecElevatedDefaults,
  ExecToolDefaults,
  ExecToolDetails,
} from "./bash-tools.exec.ts";
export { describeExecTool, describeProcessTool } from "./bash-tools.descriptions.ts";
export { createExecTool, execTool } from "./bash-tools.exec.ts";
export type { ProcessToolDefaults } from "./bash-tools.process.ts";
export { createProcessTool, processTool } from "./bash-tools.process.ts";
