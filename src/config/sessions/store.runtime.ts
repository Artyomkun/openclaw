// Runtime facade for session store mutation helpers.
export {
  applySessionStoreEntryPatch,
  cleanupSessionLifecycleArtifacts,
  updateSessionStore,
  updateSessionStoreEntry,
} from "./store.ts";
export { deleteSessionEntryLifecycle, resetSessionEntryLifecycle } from "./session-accessor.ts";
export type {
  SessionLifecycleArtifactCleanupParams,
  SessionLifecycleArtifactCleanupResult,
} from "./store.ts";
export type {
  DeleteSessionEntryLifecycleResult,
  ResetSessionEntryLifecycleResult,
  SessionLifecycleArchivedTranscript,
  SessionLifecycleStoreTarget,
} from "./session-accessor.ts";
