/**
 * MSTeams - Graph Thread
 */

export type GraphThreadMessage = {
  id?: string;
  from?: {
    user?: { displayName?: string; id?: string };
    application?: { displayName?: string; id?: string };
  };
  body?: { content?: string; contentType?: string };
  createdDateTime?: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<at[^>]*>(.*?)<\/at>/gi, "@$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const teamCache = new Map<string, string>();

export async function resolveTeamGroupId(token: string, teamId: string): Promise<string> {
  if (teamCache.has(teamId)) {
    return teamCache.get(teamId)!;
  }

  try {
    const team = await graphRequest<{ id: string }>({
      token,
      path: `/teams/${teamId}?$select=id`,
    });
    const groupId = team?.id || teamId;
    teamCache.set(teamId, groupId);
    return groupId;
  } catch {
    return teamId;
  }
}

export async function getThreadMessages(
  token: string,
  groupId: string,
  channelId: string,
  messageId: string,
  limit: number = 50
): Promise<GraphThreadMessage[]> {
  try {
    const path = `/teams/${groupId}/channels/${channelId}/messages/${messageId}/replies?$top=${Math.min(limit, 50)}&$select=id,from,body,createdDateTime`;
    const res = await graphRequest<{ value?: GraphThreadMessage[] }>({ token, path });
    return res.value || [];
  } catch {
    return [];
  }
}

export function formatThreadMessages(
  messages: GraphThreadMessage[],
  currentId?: string
): string {
  return messages
    .filter(m => m.id !== currentId && m.body?.content)
    .map(m => {
      const sender = m.from?.user?.displayName || m.from?.application?.displayName || "unknown";
      const content = m.body?.contentType === "html" 
        ? stripHtml(m.body.content) 
        : m.body?.content?.trim() || "";
      return content ? `${sender}: ${content}` : null;
    })
    .filter(Boolean)
    .join("\n");
}