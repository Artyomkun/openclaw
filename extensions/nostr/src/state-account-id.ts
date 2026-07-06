export function getNostrAccountId(accountId?: string): string {
  return accountId?.trim() || "default";
}