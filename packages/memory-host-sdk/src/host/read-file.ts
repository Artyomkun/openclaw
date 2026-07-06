/**
 * Memory Host - Read File
 */

import fs from "node:fs/promises";
import path from "node:path";
import iconv from "iconv-lite";

const SUPPORTED_ENCODINGS = [
  "utf8", "utf-8",
  "win1251", "windows-1251",
  "cp1251",
  "koi8-r",
  "iso-8859-1", "latin1",
  "iso-8859-5",
  "gb2312", "gbk",
  "shift-jis", "sjis",
  "euc-jp",
  "euc-kr",
  "utf-16le", "utf-16be",
];

function detectEncoding(buffer: Buffer): string {
  // BOM detection
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return "utf8";
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return "utf-16le";
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return "utf-16be";
  }

  // Try UTF-8 first
  try {
    const decoded = buffer.toString("utf8");
    if (decoded.includes("\uFFFD")) {
      throw new Error("Invalid UTF-8");
    }
    // Check for common Cyrillic patterns
    const cyrillic = /[а-яА-ЯёЁ]/;
    if (cyrillic.test(decoded)) {
      return "utf8";
    }
    return "utf8";
  } catch {
    // Try Windows-1251 for Cyrillic
    try {
      const decoded = iconv.decode(buffer, "win1251");
      const cyrillic = /[а-яА-ЯёЁ]/;
      if (cyrillic.test(decoded)) {
        return "win1251";
      }
    } catch {}

    // Try KOI8-R
    try {
      const decoded = iconv.decode(buffer, "koi8-r");
      const cyrillic = /[а-яА-ЯёЁ]/;
      if (cyrillic.test(decoded)) {
        return "koi8-r";
      }
    } catch {}

    // Try GBK for Chinese
    try {
      const decoded = iconv.decode(buffer, "gbk");
      const chinese = /[\u4e00-\u9fff]/;
      if (chinese.test(decoded)) {
        return "gbk";
      }
    } catch {}

    // Try Shift-JIS for Japanese
    try {
      const decoded = iconv.decode(buffer, "shift-jis");
      const japanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/;
      if (japanese.test(decoded)) {
        return "shift-jis";
      }
    } catch {}

    // Try EUC-KR for Korean
    try {
      const decoded = iconv.decode(buffer, "euc-kr");
      const korean = /[\uac00-\ud7af]/;
      if (korean.test(decoded)) {
        return "euc-kr";
      }
    } catch {}

    // Fallback
    return "utf8";
  }
}

export async function readMemoryFile(params: {
  workspaceDir: string;
  relPath: string;
  from?: number;
  lines?: number;
  encoding?: string;
}): Promise<{ text: string; path: string; encoding: string }> {
  const absPath = path.resolve(params.workspaceDir, params.relPath);
  
  try {
    const buffer = await fs.readFile(absPath);
    let encoding = params.encoding || detectEncoding(buffer);
    if (!SUPPORTED_ENCODINGS.includes(encoding.toLowerCase())) {
      encoding = "utf8";
    }
    
    let content: string;
    if (encoding.toLowerCase() === "utf8" || encoding === "utf-8") {
      content = buffer.toString("utf8");
    } else {
      content = iconv.decode(buffer, encoding);
    }
    
    const lines = content.split("\n");
    const from = Math.max(0, (params.from || 1) - 1);
    const count = params.lines || 10;
    
    return {
      text: lines.slice(from, from + count).join("\n"),
      path: params.relPath,
      encoding,
    };
  } catch (error) {
    throw new Error(`Failed to read ${absPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function readMemoryFileUtf8(params: {
  workspaceDir: string;
  relPath: string;
  from?: number;
  lines?: number;
}): Promise<{ text: string; path: string }> {
  const absPath = path.resolve(params.workspaceDir, params.relPath);
  
  try {
    const content = await fs.readFile(absPath, "utf-8");
    const lines = content.split("\n");
    const from = Math.max(0, (params.from || 1) - 1);
    const count = params.lines || 10;
    
    return {
      text: lines.slice(from, from + count).join("\n"),
      path: params.relPath,
    };
  } catch {
    return { text: "", path: params.relPath };
  }
}