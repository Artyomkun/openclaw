/**
 * Media Understanding - Format
 */

export function formatMediaBody(body: string | undefined, outputs: any[]): string {
  const texts = outputs.map(o => o.text).filter(Boolean);
  if (!texts.length) return body || "";
  const userText = body?.replace(/<media:[^>]+>/g, "").trim();
  const parts = [];
  if (userText) parts.push(`User text:\n${userText}`);
  texts.forEach((t, i) => parts.push(`[Media ${i + 1}]:\n${t}`));
  
  return parts.join("\n\n");
}