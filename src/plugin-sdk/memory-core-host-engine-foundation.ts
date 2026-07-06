/**
 * Public SDK foundation surface for memory host engine config, paths, and shared helpers.
 */
import { onInternalSessionTranscriptUpdate } from "../sessions/transcript-events.ts";

export * from "../../packages/memory-host-sdk/src/engine-foundation.ts";
export {
  resolveAgentContextLimits,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
  resolveSessionAgentId,
} from "../agents/agent-scope.ts";
export {
  resolveMemorySearchConfig,
  resolveMemorySearchSyncConfig,
  type ResolvedMemorySearchConfig,
  type ResolvedMemorySearchSyncConfig,
} from "../agents/memory-search.ts";
export { parseDurationMs } from "../cli/parse-duration.ts";
export { loadConfig } from "../config/config.ts";
export type { OpenClawConfig } from "../config/config.ts";
export { resolveStateDir } from "../config/paths.ts";
export { resolveSessionTranscriptsDirForAgent } from "../config/sessions/paths.ts";
export {
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
  type SecretInput,
} from "../config/types.secrets.ts";
export type { SessionSendPolicyConfig } from "../config/types.base.ts";
export type {
  MemoryBackend,
  MemoryCitationsMode,
  MemoryQmdConfig,
  MemoryQmdIndexPath,
  MemoryQmdMcporterConfig,
  MemoryQmdSearchMode,
} from "../config/types.memory.ts";
export type { MemorySearchConfig } from "../config/types.tools.ts";
export { root } from "../infra/fs-safe.ts";
export { createSubsystemLogger } from "../logging/subsystem.ts";
export { detectMime } from "@openclaw/media-core/mime";
export { onSessionTranscriptUpdate } from "../sessions/transcript-events.ts";
export { resolveGlobalSingleton } from "../shared/global-singleton.ts";
export { runTasksWithConcurrency } from "../utils/run-with-concurrency.ts";
export { splitShellArgs } from "../utils/shell-argv.ts";

const MEMORY_CORE_TRANSCRIPT_UPDATE_SUBSCRIBER_KEY = Symbol.for(
  "openclaw.memoryCore.sessionTranscriptUpdateSubscriber",
);

// Memory-core needs target-only internal updates before the SQLite flip, while
// the public SDK listener stays file-backed during the compatibility window.
(globalThis as Record<symbol, unknown>)[MEMORY_CORE_TRANSCRIPT_UPDATE_SUBSCRIBER_KEY] ??=
  onInternalSessionTranscriptUpdate;

export {
  resolveUserPath,
  shortenHomeInString,
  shortenHomePath,
  truncateUtf16Safe,
} from "../utils.ts";
