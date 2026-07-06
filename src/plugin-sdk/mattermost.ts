/**
 * @deprecated Compatibility facade for older third-party channel packages that
 * imported the previous Mattermost-shaped helper bundle. New plugins should
 * import the generic SDK subpaths directly.
 */
export { resolveControlCommandGate } from "./command-auth.ts";
export { formatPairingApproveHint } from "./channel-plugin-common.ts";
export type { HistoryEntry } from "./reply-history.ts";
export {
  createChannelHistoryWindow,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
} from "./reply-history.ts";
