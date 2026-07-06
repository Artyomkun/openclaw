// Public facade for plugin auto-enable detection, application, and reason types.
export {
  applyPluginAutoEnable,
  materializePluginAutoEnableCandidates,
} from "./plugin-auto-enable.apply.ts";
export { detectPluginAutoEnableCandidates } from "./plugin-auto-enable.detect.ts";
export type {
  PluginAutoEnableCandidate,
  PluginAutoEnableResult,
} from "./plugin-auto-enable.types.ts";
export { resolvePluginAutoEnableCandidateReason } from "./plugin-auto-enable.shared.ts";
