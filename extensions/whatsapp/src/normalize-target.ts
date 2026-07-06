/**
 * WhatsApp - Target Normalization
 */

import { normalizeE164 } from "openclaw/plugin-sdk/account-resolution";

const JID_RE = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/i;
const GROUP_JID_RE = /^(\d+(-?\d+)*)@g\.us$/i;
const LID_RE = /^(\d+)@lid$/i;

function clean(raw: string): string {
  return raw.trim().replace(/^whatsapp:/i, "").trim();
}

export function normalizeTarget(raw: string): string | null {
  const value = clean(raw);
  if (!value) return null;
  if (GROUP_JID_RE.test(value)) {
    return value.toLowerCase();
  }
  const jidMatch = value.match(JID_RE);
  if (jidMatch) {
    const phone = normalizeE164(jidMatch[1]);
    return phone.length > 1 ? phone : null;
  }
  const lidMatch = value.match(LID_RE);
  if (lidMatch) {
    const phone = normalizeE164(lidMatch[1]);
    return phone.length > 1 ? phone : null;
  }
  if (!value.includes("@") && !/[^0-9+\-]/.test(value)) {
    const phone = normalizeE164(value);
    return phone.length > 1 ? phone : null;
  }

  return null;
}

export function looksLikeTarget(raw: string): boolean {
  return Boolean(raw.trim() && normalizeTarget(raw));
}