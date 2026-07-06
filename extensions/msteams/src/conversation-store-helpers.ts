/**
 * MSTeams - Conversation Store Helpers
 */

import type { MSTeamsConversationStoreEntry } from "./conversation-store.js";

export function findPreferredDmConversationByUserId(
  id: string,
): MSTeamsConversationStoreEntry {
  const target = id.trim();
  const matches = entries.filter(e => 
    e.reference.user?.id === target || 
    e.reference.user?.aadObjectId === target
  );
  return matches.sort((a, b) => new Date(b.reference.lastSeenAt) - new Date(a.reference.lastSeenAt))[0];
}