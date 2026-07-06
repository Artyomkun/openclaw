/**
 * Memory Host - Read File Shared
 */

const DEFAULT_LINES = 120;
const DEFAULT_MAX_CHARS = 12000;

export function buildMemoryReadResult(params: {
  content: string;
  relPath: string;
  from?: number;
  lines?: number;
}): { text: string; path: string; from: number; lines: number; truncated?: boolean } {
  const from = Math.max(1, params.from || 1);
  const count = Math.max(1, params.lines || DEFAULT_LINES);
  const allLines = params.content.split("\n");
  
  const selected = allLines.slice(from - 1, from - 1 + count);
  let text = selected.join("\n");
  let truncated = false;
  if (text.length > DEFAULT_MAX_CHARS) {
    text = text.slice(0, DEFAULT_MAX_CHARS) + "\n\n[Truncated by character limit]";
    truncated = true;
  }
  
  return {
    text,
    path: params.relPath,
    from,
    lines: selected.length,
    truncated,
  };
}