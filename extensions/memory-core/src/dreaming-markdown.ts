/**
 * Memory Core - Dreaming Markdown
 * 
 * Просто записывает блоки в файлы.
 * БЕЗ ПРОГЛАТЫВАНИЯ ОШИБОК!
 */

import fs from "node:fs/promises";
import path from "node:path";

const PHASE_HEADINGS = {
  light: "## Light Sleep",
  rem: "## REM Sleep",
};

const PHASE_MARKERS = {
  light: { start: "<!-- openclaw:dreaming:light:start -->", end: "<!-- openclaw:dreaming:light:end -->" },
  rem: { start: "<!-- openclaw:dreaming:rem:start -->", end: "<!-- openclaw:dreaming:rem:end -->" },
};

export async function writeDailyDreamingPhaseBlock(params: {
  workspaceDir: string;
  phase: "light" | "rem";
  bodyLines: string[];
  nowMs?: number;
  timezone?: string;
}): Promise<void> {
  const now = new Date(params.nowMs || Date.now());
  const day = now.toISOString().slice(0, 10);
  const filePath = path.join(params.workspaceDir, "memory", `${day}.md`);
  const body = params.bodyLines.length ? params.bodyLines.join("\n") : "- No notable updates.";
  const markers = PHASE_MARKERS[params.phase];
  const heading = PHASE_HEADINGS[params.phase];
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      content = "";
    } else {
      throw new Error(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const startIdx = content.indexOf(markers.start);
  const endIdx = content.indexOf(markers.end);
  
  if (startIdx !== -1 && endIdx !== -1) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + markers.end.length);
    content = before + `${markers.start}\n${heading}\n${body}\n${markers.end}` + after;
  } else {
    const newBlock = `\n${markers.start}\n${heading}\n${body}\n${markers.end}\n`;
    content = content + newBlock;
  }
  
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  } catch (error) {
    throw new Error(`Failed to write ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}