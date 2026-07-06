// Whatsapp plugin module implements group session key behavior.
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  resolveThreadSessionKeys,
  type ResolvedAgentRoute,
} from "openclaw/plugin-sdk/routing";

function resolveWhatsAppGroupAccountThreadId(accountId: string): string {
  return `whatsapp-account-${normalizeAccountId(accountId)}`;
}

export function resolveWhatsAppGroupSessionRoute(route: ResolvedAgentRoute): ResolvedAgentRoute {
  if (route.accountId === DEFAULT_ACCOUNT_ID || !route.sessionKey.includes(":group:")) {
    return route;
  }
  const scopedSession = resolveThreadSessionKeys({
    baseSessionKey: route.sessionKey,
    threadId: resolveWhatsAppGroupAccountThreadId(route.accountId),
  });
  return {
    ...route,
    sessionKey: scopedSession.sessionKey,
  };
}
