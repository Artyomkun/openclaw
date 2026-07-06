/**
 * MSTeams - Graph API Client
 */

import { fetchWithSsrFGuard } from "../runtime-api.js";
import { buildUserAgent } from "./user-agent.js";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

export async function graphRequest<T>(params: {
  token: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<T> {
  const url = `${GRAPH_ROOT}${params.path}`;
  const { response, release } = await fetchWithSsrFGuard({
    url,
    init: {
      method: params.method || "GET",
      headers: {
        "User-Agent": buildUserAgent(),
        Authorization: `Bearer ${params.token}`,
        "Content-Type": "application/json",
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
    },
    auditContext: "msteams.graph",
  });

  try {
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Graph API error ${response.status}: ${error}`);
    }
    return await response.json();
  } finally {
    await release();
  }
}

export async function resolveGraphToken(cfg: any): Promise<string> {
  const { getAccessToken } = await import("./token.js");
  const token = await getAccessToken(cfg);
  if (!token) throw new Error("Graph token unavailable");
  return token;
}

export async function listTeams(token: string, query: string): Promise<any[]> {
  const filter = `startsWith(displayName,'${query.replace(/'/g, "''")}')`;
  const { value = [] } = await graphRequest<{ value: any[] }>({
    token,
    path: `/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName`,
  });
  return value;
}

export async function listChannels(token: string, teamId: string): Promise<any[]> {
  const { value = [] } = await graphRequest<{ value: any[] }>({
    token,
    path: `/teams/${teamId}/channels?$select=id,displayName`,
  });
  return value;
}