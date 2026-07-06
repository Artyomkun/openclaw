/**
 * MSTeams - Graph Users
 */

export type GraphUser = {
  id?: string;
  displayName?: string;
  userPrincipalName?: string;
  mail?: string;
};

export async function searchGraphUsers(params: {
  token: string;
  query: string;
  top?: number;
}): Promise<GraphUser[]> {
  const query = params.query.trim();
  if (!query) {
    return [];
  }

  if (query.includes("@")) {
    const escaped = query.replace(/'/g, "''");
    const filter = `(mail eq '${escaped}' or userPrincipalName eq '${escaped}')`;
    const path = `/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName`;
    
    const res = await graphRequest<{ value?: GraphUser[] }>({
      token: params.token,
      path,
    });
    
    return res.value ?? [];
  }
  const top = params.top ?? 10;
  const path = `/users?$search=${encodeURIComponent(`"displayName:${query}"`)}&$select=id,displayName,mail,userPrincipalName&$top=${top}`;
  
  const res = await graphRequest<{ value?: GraphUser[] }>({
    token: params.token,
    path,
    headers: { ConsistencyLevel: "eventual" },
  });
  
  return res.value ?? [];
}

export function formatGraphUser(user: GraphUser): string {
  const parts = [];
  if (user.displayName) parts.push(user.displayName);
  if (user.mail) parts.push(`<${user.mail}>`);
  if (user.userPrincipalName && !user.mail) parts.push(`<${user.userPrincipalName}>`);
  return parts.length ? parts.join(" ") : user.id || "Unknown";
}

export async function findUserByEmail(params: {
  token: string;
  email: string;
}): Promise<GraphUser | null> {
  const users = await searchGraphUsers({
    token: params.token,
    query: params.email,
  });
  return users.find(u => u.mail?.toLowerCase() === params.email.toLowerCase()) || null;
}

export async function findUserById(params: {
  token: string;
  userId: string;
}): Promise<GraphUser | null> {
  try {
    const user = await graphRequest<GraphUser>({
      token: params.token,
      path: `/users/${params.userId}?$select=id,displayName,mail,userPrincipalName`,
    });
    return user || null;
  } catch {
    return null;
  }
}