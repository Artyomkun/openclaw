/**
 * Telegram - Token Resolution
 */

import { readFileSync } from "node:fs";

export function resolveTelegramToken(cfg?: any, opts?: any): { token: string; source: string } {
  const accountId = opts?.accountId || "default";
  const account = cfg?.channels?.telegram?.accounts?.[accountId];
  if (account?.tokenFile) {
    try {
      const token = readFileSync(account.tokenFile, "utf-8").trim();
      return { token, source: "tokenFile" };
    } catch {}
  }
  if (account?.botToken) {
    return { token: account.botToken, source: "config" };
  }
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  return { token: "", source: "none" };
}