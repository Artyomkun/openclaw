import { retireSessionMcpRuntime } from "../../agents/agent-bundle-mcp-tools.ts";
import { isCronSessionKey } from "../../routing/session-key.ts";
import { createLazyImportLoader } from "../../shared/lazy-promise.ts";
import type { CronJob } from "../types.ts";

const gatewayCallRuntimeLoader = createLazyImportLoader(
  () => import("../../gateway/call.runtime.js"),
);

async function loadGatewayCallRuntime(): Promise<typeof import("../../gateway/call.runtime.js")> {
  return await gatewayCallRuntimeLoader.load();
}

export async function cleanupCronRunSessionAfterRun(params: {
  job: Pick<CronJob, "deleteAfterRun">;
  agentSessionKey: string;
  sessionId: string;
  reason: string;
}): Promise<boolean> {
  if (!params.job.deleteAfterRun) {
    return false;
  }
  if (!isCronSessionKey(params.agentSessionKey)) {
    return false;
  }
  try {
    const { callGateway } = await loadGatewayCallRuntime();
    await callGateway({
      method: "sessions.delete",
      params: {
        key: params.agentSessionKey,
        deleteTranscript: true,
        emitLifecycleHooks: false,
      },
      timeoutMs: 10_000,
    });
  } catch {
    await retireSessionMcpRuntime({
      sessionId: params.sessionId,
      reason: params.reason,
    });
  }
  return true;
}
