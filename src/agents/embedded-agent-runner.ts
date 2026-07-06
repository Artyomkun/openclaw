// Embedded-agent runner barrel. Focused submodules own run orchestration,
// compaction, queues, sandbox metadata, and SDK tool splitting.
export { compactEmbeddedAgentSession } from "./embedded-agent-runner/compact.queued.ts";
export { applyExtraParamsToAgent } from "./embedded-agent-runner/extra-params.ts";

export { resolveEmbeddedSessionLane } from "./embedded-agent-runner/lanes.ts";
export { runEmbeddedAgent } from "./embedded-agent-runner/run.ts";
export {
  abortAndDrainEmbeddedAgentRun,
  abortEmbeddedAgentRun,
  isEmbeddedAgentRunAbortableForCompaction,
  isEmbeddedAgentRunActive,
  isEmbeddedAgentRunHandleActive,
  isEmbeddedAgentRunStreaming,
  queueEmbeddedAgentMessage,
  queueEmbeddedAgentMessageWithOutcome,
  resolveActiveEmbeddedRunSessionId,
  resolveActiveEmbeddedRunSessionId as resolveActiveEmbeddedAgentRunSessionId,
  resolveActiveEmbeddedRunSessionIdBySessionFile,
  waitForEmbeddedAgentRunEnd,
} from "./embedded-agent-runner/runs.ts";
export { buildEmbeddedSandboxInfo } from "./embedded-agent-runner/sandbox-info.ts";
export { splitSdkTools } from "./embedded-agent-runner/tool-split.ts";
export type {
  EmbeddedAgentMeta,
  EmbeddedAgentCompactResult,
  EmbeddedAgentRunMeta,
  EmbeddedAgentRunResult,
} from "./embedded-agent-runner/types.ts";
