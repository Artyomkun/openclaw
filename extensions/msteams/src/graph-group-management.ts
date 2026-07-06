/**
 * MSTeams - Graph Group Management
 */

import type { OpenClawConfig } from "../runtime-api.js";
import { resolveGraphToken, graphRequest } from "./graph.js";

type GraphMember = { id?: string; userId?: string };

const conversationCache = new Map<string, { kind: "chat" | "channel"; basePath: string; id: string }>();

async function resolveConversation(to: string): Promise<{ kind: "chat" | "channel"; basePath: string; id: string }> {
  if (conversationCache.has(to)) {
    return conversationCache.get(to)!;
  }

  const id = await resolveGraphConversationId(to);
  
  let result: { kind: "chat" | "channel"; basePath: string; id: string };
  if (id.includes("/")) {
    const [teamId, channelId] = id.split("/", 2);
    result = { kind: "channel", basePath: `/teams/${teamId}/channels/${channelId}`, id };
  } else {
    result = { kind: "chat", basePath: `/chats/${id}`, id };
  }

  conversationCache.set(to, result);
  return result;
}

async function resolveGraphConversationId(to: string): Promise<string> {
  if (to.startsWith("19:")) return to;
  if (to.includes("/")) return to;
  
  if (to.startsWith("user:")) {
    const userId = to.replace("user:", "");
    const store = createMSTeamsConversationStoreState();
    const found = await store.findPreferredDmByUserId(userId);
    if (!found) throw new Error(`No conversation found for user:${userId}`);
    return found.reference.graphChatId || found.conversationId;
  }
  
  return to;
}

export async function addMember(params: {
  cfg: OpenClawConfig;
  to: string;
  userId: string;
  role?: "member" | "owner";
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  
  await graphRequest({
    token,
    path: `${conv.basePath}/members`,
    method: "POST",
    body: {
      "@odata.type": "#microsoft.graph.aadUserConversationMember",
      roles: [params.role || "member"],
      "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${params.userId.replace(/'/g, "''")}')`,
    },
  });
  
  return { added: { userId: params.userId, chatId: conv.id } };
}

export async function removeMember(params: {
  cfg: OpenClawConfig;
  to: string;
  userId: string;
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  
  const members = await graphRequest<{ value?: GraphMember[] }>({
    token,
    path: `${conv.basePath}/members`,
  });
  
  const member = members.value?.find(m => m.userId === params.userId);
  if (!member?.id) {
    throw new Error(`User ${params.userId} is not a member`);
  }
  
  await graphRequest({
    token,
    path: `${conv.basePath}/members/${member.id}`,
    method: "DELETE",
  });
  
  return { removed: { userId: params.userId, chatId: conv.id } };
}

export async function renameGroup(params: {
  cfg: OpenClawConfig;
  to: string;
  name: string;
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  
  const body = conv.kind === "chat" ? { topic: params.name } : { displayName: params.name };
  
  await graphRequest({
    token,
    path: conv.basePath,
    method: "PATCH",
    body,
  });
  
  return { renamed: { chatId: conv.id, newName: params.name } };
}

export function clearConversationCache(): void {
  conversationCache.clear();
}