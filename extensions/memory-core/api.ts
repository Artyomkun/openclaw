// Memory Core API module exposes the plugin public contract.
export type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
export type {
  MemoryEmbeddingProbeResult,
  MemoryProviderStatus,
  MemorySyncProgressUpdate,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";
export { previewGroundedRemMarkdown } from "./src/rem-evidence.js";
export { previewRemHarness } from "./src/rem-harness.js";
export { configureMemoryCoreDreamingState } from "./src/dreaming-state.js";
export {
  writeDreamingShadowTrialReport,
} from "./src/dreaming-shadow-trial.js";
