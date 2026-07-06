/**
 * MSTeams - Graph Members
 */

import type { OpenClawConfig } from "../runtime-api.js";
import { resolveGraphToken, graphRequest } from "./graph.js";

type GraphUserProfile = {
  id?: string;
  displayName?: string;
  mail?: string;
  jobTitle?: string;
  userPrincipalName?: string;
  officeLocation?: string;
};

type GetMemberInfoParams = {
  cfg: OpenClawConfig;
  userId: string;
};

type GetMemberInfoResult = {
  user: {
    id: string | undefined;
    displayName: string | undefined;
    mail: string | undefined;
    jobTitle: string | undefined;
    userPrincipalName: string | undefined;
    officeLocation: string | undefined;
  };
};

export async function getMemberInfo(
  params: GetMemberInfoParams
): Promise<GetMemberInfoResult> {
  const token = await resolveGraphToken(params.cfg);
  const path = `/users/${encodeURIComponent(params.userId)}?$select=id,displayName,mail,jobTitle,userPrincipalName,officeLocation`;
  const user = await graphRequest<GraphUserProfile>({ token, path });
  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      mail: user.mail,
      jobTitle: user.jobTitle,
      userPrincipalName: user.userPrincipalName,
      officeLocation: user.officeLocation,
    },
  };
}