/**
 * Memory Host - QMD Scope
 */

export function isQmdScopeAllowed(scope: any, sessionKey?: string): boolean {
  if (!scope?.rules?.length) return true;

  const key = sessionKey?.trim().toLowerCase() || "";
  const channel = key.split(":")[0] || "";
  const isGroup = key.includes(":group:");
  const isChannel = key.includes(":channel:");
  const chatType = isGroup ? "group" : isChannel ? "channel" : "direct";

  for (const rule of scope.rules) {
    if (!rule) continue;
    if (rule.match?.channel && rule.match.channel !== channel) continue;
    if (rule.match?.chatType && rule.match.chatType !== chatType) continue;
    if (rule.match?.keyPrefix && !key.includes(rule.match.keyPrefix)) continue;
    return rule.action === "allow";
  }

  return scope.default !== "deny";
}