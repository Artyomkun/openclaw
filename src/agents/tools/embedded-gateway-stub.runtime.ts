/**
 * Runtime dependency barrel for the embedded Gateway stub.
 *
 * Tests mock this module to exercise local sessions.list/sessions.resolve/chat.history
 * behavior without importing the full Gateway server graph.
 */
export { resolveSessionAgentId } from "../../agents/agent-scope.ts";
export { getRuntimeConfig } from "../../config/config.ts";
export {
  dropPreSessionStartAnnouncePairs,
  projectChatDisplayMessages,
  projectRecentChatDisplayMessages,
  resolveEffectiveChatHistoryMaxChars,
} from "../../gateway/chat-display-projection.ts";
export { augmentChatHistoryWithCliSessionImports } from "../../gateway/cli-session-history.ts";
export { getMaxChatHistoryMessagesBytes } from "../../gateway/server-constants.ts";
export {
  augmentChatHistoryWithCanvasBlocks,
  CHAT_HISTORY_MAX_SINGLE_MESSAGE_BYTES,
  enforceChatHistoryFinalBudget,
  replaceOversizedChatHistoryMessages,
} from "../../gateway/server-methods/chat.ts";
export {
  capArrayByJsonBytes,
  readRecentSessionMessagesWithStatsAsync,
  readSessionMessagesPageWithStatsAsync,
  readSessionMessagesAsync,
} from "../../gateway/session-transcript-readers.ts";
export {
  listSessionsFromStoreAsync,
  loadCombinedSessionStoreForGateway,
  loadSessionEntry,
  resolveSessionModelRef,
} from "../../gateway/session-utils.ts";
export { resolveSessionKeyFromResolveParams } from "../../gateway/sessions-resolve.ts";
export type { SessionsListResult } from "../../gateway/session-utils.types.ts";
