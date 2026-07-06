/**
 * MSTeams - Conversation Store
 */

import type { StoredConversationReference } from "./conversation-store.js";

const store = new Map<string, StoredConversationReference>();

export function createMSTeamsConversationStore() {
  return {
    get: async (id: string) => store.get(id),
    upsert: async (id: string, ref: StoredConversationReference) => {
      store.set(id, { ...ref, lastSeenAt: new Date().toISOString() });
    },
    remove: async (id: string) => store.delete(id),
    list: async () => Array.from(store.entries()).map(([id, ref]) => ({ conversationId: id, reference: ref })),
    findPreferredDmByUserId: async (userId: string) => {
      const entries = Array.from(store.entries())
        .filter(([, ref]) => 
          ref.user?.id === userId || ref.user?.aadObjectId === userId
        )
        .sort((a, b) => 
          new Date(b[1].lastSeenAt).getTime() - new Date(a[1].lastSeenAt).getTime()
        );
      return entries[0] ? { conversationId: entries[0][0], reference: entries[0][1] } : null;
    },
  };
}