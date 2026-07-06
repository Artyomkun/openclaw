// Runtime control seam for cancelling ACP sessions and subagent runs from task APIs.
export { getAcpSessionManager } from "../acp/control-plane/manager.ts";
export { killSubagentRunAdmin } from "../agents/subagent-control.ts";
