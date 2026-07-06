/**
 * ACP - Session Identifiers
 */

export function getSessionId(meta: any): string | undefined {
  return meta?.identity?.agentSessionId || 
          meta?.identity?.acpxSessionId || 
          meta?.identity?.acpxRecordId;
}

export function formatSessionId(meta: any): string {
  const id = getSessionId(meta);
  return id ? `Session: ${id}` : "No session";
}