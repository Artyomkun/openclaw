/**
 * Opt-in context pruning (“microcompact”-style) for agent sessions.
 *
 * This only affects the in-memory context for the current request; it does not rewrite session
 * history persisted on disk.
 */

export { default } from "./context-pruning/extension.ts";

export { pruneContextMessages } from "./context-pruning/pruner.ts";
export {
  computeEffectiveSettings,
  DEFAULT_CONTEXT_PRUNING_SETTINGS,
} from "./context-pruning/settings.ts";
