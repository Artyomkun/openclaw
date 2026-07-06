/** Runtime-only dispatch dependencies shared by config-driven reply delivery. */
import { updateSessionEntry } from "../../config/sessions/session-accessor.ts";
import type { SessionEntry } from "../../config/sessions/types.ts";

export { resolveStorePath } from "../../config/sessions/paths.ts";
export {
  loadSessionStore,
  readSessionEntry,
  resolveSessionStoreEntry,
} from "../../config/sessions/store.ts";
export { createInternalHookEvent, triggerInternalHook } from "../../hooks/internal-hooks.ts";

export async function updateSessionStoreEntry(params: {
  storePath: string;
  sessionKey: string;
  skipMaintenance?: boolean;
  takeCacheOwnership?: boolean;
  update: (
    entry: SessionEntry,
  ) => Promise<Partial<SessionEntry> | null> | Partial<SessionEntry> | null;
}): Promise<SessionEntry | null> {
  return await updateSessionEntry(
    {
      storePath: params.storePath,
      sessionKey: params.sessionKey,
    },
    params.update,
    {
      skipMaintenance: params.skipMaintenance,
      takeCacheOwnership: params.takeCacheOwnership,
    },
  );
}
