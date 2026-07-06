/**
 * Memory Core - Concept Vocabulary
 * 
 * Простое извлечение тегов из текста.
 * БЕЗ СОВ!
 */

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "assistant", "because", "before",
  "being", "between", "build", "called", "could", "daily", "default",
  "deploy", "during", "every", "file", "files", "from", "have", "into",
  "just", "line", "lines", "long", "main", "make", "memory", "month",
  "more", "most", "move", "much", "next", "note", "notes", "over",
  "part", "past", "port", "same", "score", "search", "session",
  "sessions", "short", "should", "since", "some", "subagent", "system",
  "than", "that", "their", "there", "these", "they", "this", "through",
  "today", "user", "using", "with", "work", "workspace", "year",
  "and", "are", "for", "into", "its", "our", "the", "then", "were", "you", "your",
]);

export function deriveConceptTags(params: {
  path: string;
  snippet: string;
  limit?: number;
}): string[] {
  const limit = Math.min(params.limit || 8, 8);
  const text = `${params.path} ${params.snippet}`.toLowerCase();
  const words = text.split(/[^a-z0-9_]+/).filter(w => w.length > 2);
  const tags: string[] = [];
  const seen = new Set<string>();
  
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    if (seen.has(word)) continue;
    
    seen.add(word);
    tags.push(word);
    
    if (tags.length >= limit) break;
  }
  
  return tags;
}