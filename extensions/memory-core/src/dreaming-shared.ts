/**
 * Memory Core - Dreaming Shared
 * 
 * Простые утилиты для dreaming.
 */

export { asNullableRecord as asRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
export { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";

export function normalizeTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

export function includesSystemEventToken(cleanedBody: string, eventText: string): boolean {
  const body = normalizeTrimmedString(cleanedBody);
  const event = normalizeTrimmedString(eventText);
  if (!body || !event) return false;
  return body === event || body.split("\n").some(line => line.trim() === event);
}