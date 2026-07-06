/**
 * MSTeams - Graph Messages
 */

import type { OpenClawConfig } from "../runtime-api.js";
import { resolveGraphToken, graphRequest } from "./graph.js";

type GraphMessage = {
  id?: string;
  body?: { content?: string };
  from?: { user?: { id?: string; displayName?: string }; application?: { displayName?: string } };
  createdDateTime?: string;
  reactions?: Array<{ reactionType?: string; user?: { id?: string; displayName?: string } }>;
};

const conversationCache = new Map<string, { kind: "chat" | "channel"; basePath: string }>();


async function resolveConversation(to: string): Promise<{ kind: "chat" | "channel"; basePath: string }> {
  if (conversationCache.has(to)) {
    return conversationCache.get(to)!;
  }

  let id = to;
  if (to.startsWith("user:")) {
    const userId = to.replace("user:", "");
    const store = createMSTeamsConversationStoreState();
    const found = await store.findPreferredDmByUserId(userId);
    if (!found) throw new Error(`No conversation found for ${to}`);
    id = found.reference.graphChatId || found.conversationId;
  }

  let result: { kind: "chat" | "channel"; basePath: string };
  if (id.includes("/")) {
    const [teamId, channelId] = id.split("/", 2);
    result = { kind: "channel", basePath: `/teams/${teamId}/channels/${channelId}` };
  } else {
    result = { kind: "chat", basePath: `/chats/${id}` };
  }

  conversationCache.set(to, result);
  return result;
}

export async function getMessage(params: {
  cfg: OpenClawConfig;
  to: string;
  messageId: string;
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  const path = `${conv.basePath}/messages/${params.messageId}`;
  const msg = await graphRequest<GraphMessage>({ token, path });
  
  return {
    id: msg.id || params.messageId,
    text: msg.body?.content,
    from: msg.from,
    createdAt: msg.createdDateTime,
  };
}

export async function pinMessage(params: {
  cfg: OpenClawConfig;
  to: string;
  messageId: string;
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  if (conv.kind === "channel") {
    throw new Error("Pin not supported for channels");
  }
  
  const result = await postGraphRequest<{ id?: string }>({
    token,
    path: `${conv.basePath}/pinnedMessages`,
    body: { "message@odata.bind": `https://graph.microsoft.com/v1.0${conv.basePath}/messages/${params.messageId}` },
  });
  return { ok: true, pinnedMessageId: result.id };
}

export async function unpinMessage(params: {
  cfg: OpenClawConfig;
  to: string;
  pinnedMessageId: string;
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  if (conv.kind === "channel") {
    throw new Error("Unpin not supported for channels");
  }
  await graphRequest({ token, path: `${conv.basePath}/pinnedMessages/${params.pinnedMessageId}`, method: "DELETE" });
  return { ok: true };
}

export async function listPins(params: {
  cfg: OpenClawConfig;
  to: string;
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  if (conv.kind === "channel") {
    throw new Error("List pins not supported for channels");
  }
  
  const res = await graphRequest<{ value?: Array<{ id?: string; message?: GraphMessage }> }>({
    token,
    path: `${conv.basePath}/pinnedMessages?$expand=message&$top=50`,
  });
  return { pins: (res.value || []).map(p => ({ id: p.id, messageId: p.message?.id, text: p.message?.body?.content })) };
}

export async function react(params: {
  cfg: OpenClawConfig;
  to: string;
  messageId: string;
  reactionType: string;
}) {
  const token = await resolveGraphToken(params.cfg, { preferDelegated: true });
  const conv = await resolveConversation(params.to);
  const path = `${conv.basePath}/messages/${params.messageId}/setReaction`;
  await postGraphRequest({ token, path, body: { reactionType: params.reactionType } });
  return { ok: true };
}

export async function unreact(params: {
  cfg: OpenClawConfig;
  to: string;
  messageId: string;
  reactionType: string;
}) {
  const token = await resolveGraphToken(params.cfg, { preferDelegated: true });
  const conv = await resolveConversation(params.to);
  const path = `${conv.basePath}/messages/${params.messageId}/unsetReaction`;
  await postGraphRequest({ token, path, body: { reactionType: params.reactionType } });
  return { ok: true };
}

export async function listReactions(params: {
  cfg: OpenClawConfig;
  to: string;
  messageId: string;
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  const path = `${conv.basePath}/messages/${params.messageId}`;
  const msg = await graphRequest<GraphMessage>({ token, path });
  
  const reactions = new Map<string, { count: number; users: Array<{ id: string; displayName?: string }> }>();
  for (const r of msg.reactions || []) {
    const type = r.reactionType || "unknown";
    const group = reactions.get(type) || { count: 0, users: [] };
    group.count++;
    if (r.user?.id) group.users.push({ id: r.user.id, displayName: r.user.displayName });
    reactions.set(type, group);
  }
  return { reactions: Array.from(reactions.entries()).map(([type, data]) => ({ reactionType: type, count: data.count, users: data.users })) };
}

export async function searchMessages(params: {
  cfg: OpenClawConfig;
  to: string;
  query: string;
  from?: string;
  limit?: number;
}) {
  const token = await resolveGraphToken(params.cfg);
  const conv = await resolveConversation(params.to);
  const top = Math.min(params.limit || 25, 50);
  
  const filters = [`$search=${encodeURIComponent(`"${params.query.replace(/"/g, "")}"`)}`, `$top=${top}`];
  if (params.from) {
    filters.push(`$filter=${encodeURIComponent(`from/user/displayName eq '${params.from.replace(/'/g, "''")}'`)}`);
  }
  
  const res = await graphRequest<{ value?: GraphMessage[] }>({
    token,
    path: `${conv.basePath}/messages?${filters.join("&")}`,
    headers: { ConsistencyLevel: "eventual" },
  });
  
  return { messages: (res.value || []).map(m => ({ id: m.id || "", text: m.body?.content, from: m.from, createdAt: m.createdDateTime })) };
}

export function clearConversationCache(): void {
  conversationCache.clear();
}