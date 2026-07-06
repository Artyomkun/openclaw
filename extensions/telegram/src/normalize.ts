/**
 * Telegram - Target Normalization
 */

import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/string-coerce-runtime";

const TELEGRAM_PREFIX_RE = /^(telegram|tg):/i;

export function normalizeTelegramMessagingTarget(raw: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const cleaned = raw.trim().replace(TELEGRAM_PREFIX_RE, "").trim();
  if (!cleaned) return undefined;
  
  return normalizeLowercaseStringOrEmpty(`telegram:${cleaned}`);
}

export function looksLikeTelegramTargetId(raw: string): boolean {
  if (!raw?.trim()) return false;
  return raw.trim().replace(TELEGRAM_PREFIX_RE, "").trim().length > 0;
}