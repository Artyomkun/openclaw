/**
 * MSTeams - Graph Teams
 * 
 * Простая работа с Teams через Graph API.
 */

import type { OpenClawConfig } from "../runtime-api.js";
import { resolveGraphToken, graphRequest } from "./graph.js";

type GraphChannel = {
  id?: string;
  displayName?: string;
  description?: string;
  membershipType?: string;
  webUrl?: string;
  createdDateTime?: string;
};

export async function listChannelsMSTeams(params: {
  cfg: OpenClawConfig;
  teamId: string;
  maxPages?: number;
}): Promise<{
  channels: Array<{
    id: string | undefined;
    displayName: string | undefined;
    description: string | undefined;
    membershipType: string | undefined;
  }>;
  truncated: boolean;
}> {
  const token = await resolveGraphToken(params.cfg);
  const maxPages = params.maxPages || 10;
  const channels: GraphChannel[] = [];
  let nextPath: string | undefined = `/teams/${params.teamId}/channels?$select=id,displayName,description,membershipType`;
  let page = 0;

  while (nextPath && page < maxPages) {
    const res = await graphRequest<{
      value?: GraphChannel[];
      "@odata.nextLink"?: string;
    }>({
      token,
      path: nextPath,
    });

    channels.push(...(res.value || []));
    nextPath = res["@odata.nextLink"]?.replace("https://graph.microsoft.com/v1.0", "");
    page++;
  }

  return {
    channels: channels.map(ch => ({
      id: ch.id,
      displayName: ch.displayName,
      description: ch.description,
      membershipType: ch.membershipType,
    })),
    truncated: Boolean(nextPath),
  };
}

export async function getChannelInfoMSTeams(params: {
  cfg: OpenClawConfig;
  teamId: string;
  channelId: string;
}): Promise<{
  channel: {
    id: string | undefined;
    displayName: string | undefined;
    description: string | undefined;
    membershipType: string | undefined;
    webUrl: string | undefined;
    createdDateTime: string | undefined;
  };
}> {
  const token = await resolveGraphToken(params.cfg);
  const path = `/teams/${params.teamId}/channels/${params.channelId}?$select=id,displayName,description,membershipType,webUrl,createdDateTime`;
  
  const channel = await graphRequest<GraphChannel>({ token, path });
  
  return {
    channel: {
      id: channel.id,
      displayName: channel.displayName,
      description: channel.description,
      membershipType: channel.membershipType,
      webUrl: channel.webUrl,
      createdDateTime: channel.createdDateTime,
    },
  };
}