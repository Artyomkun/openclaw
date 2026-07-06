import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const MediaOutputSchema = z.object({
  text: z.string(),
  mediaUrls: z.array(z.string()).optional(),
  audioAsVoice: z.boolean().optional(),
});

type MediaOutput = z.infer<typeof MediaOutputSchema>;

// ============================================
// MAIN
// ============================================

export function splitMediaFromOutput(raw: string): MediaOutput {
  if (!raw?.trim()) return { text: "" };

  const media: string[] = [];
  const lines = raw.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    
    // MEDIA: directive
    if (trimmed.toUpperCase().startsWith("MEDIA:")) {
      const match = trimmed.match(/MEDIA:\s*`?([^\n`]+)`?/i);
      if (match) {
        const parts = match[1].trim().split(/\s+/);
        for (const part of parts) {
          const clean = part.replace(/^["'`[(]+/, "").replace(/["'`)\]}]+$/, "");
          if (isValidMedia(clean)) {
            media.push(clean);
            continue;
          }
        }
      }
      continue;
    }

    // Markdown images ![alt](url)
    const imageMatches = line.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g);
    let hasMedia = false;
    let cleaned = line;

    for (const match of imageMatches) {
      const url = match[1].trim();
      if (isValidMedia(url)) {
        media.push(url);
        hasMedia = true;
        // Remove the markdown image from text
        cleaned = cleaned.replace(match[0], "");
      }
    }

    if (!hasMedia) {
      kept.push(line);
    } else if (cleaned.trim()) {
      kept.push(cleaned);
    }
  }

  let text = kept.join("\n").trim();

  // Audio tag
  const audioMatch = text.match(/\[\[audio_as_voice\]\]/);
  const audioAsVoice = !!audioMatch;
  if (audioMatch) {
    text = text.replace(/\[\[audio_as_voice\]\]/, "").trim();
  }

  return {
    text,
    ...(media.length ? { mediaUrls: media } : {}),
    ...(audioAsVoice ? { audioAsVoice: true } : {}),
  };
}

// ============================================
// HELPERS
// ============================================

function isValidMedia(url: string): boolean {
  if (!url) return false;
  if (url.length > 4096) return false;
  
  // Remote URLs
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return false;
      if (parsed.username || parsed.password) return false;
      const host = parsed.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1") return false;
      if (host.endsWith(".local") || host.endsWith(".internal")) return false;
      return true;
    } catch {
      return false;
    }
  }
  
  // Local paths
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("~/")) {
    if (url.includes("../") || url === "..") return false;
    return true;
  }
  
  // Windows paths
  if (/^[a-zA-Z]:[\\/]/.test(url)) return true;
  
  // Bare filenames with extension
  if (/\.\w{1,10}$/.test(url) && !url.includes(" ")) return true;
  
  return false;
}