/**
 * Memory Core - REM Evidence
 */

import fs from "node:fs/promises";
import path from "node:path";

const IMPORTANT_RE = /\b(prefers?|always|rule:|learned:|remember|standing rule|relationship|partner|wife|husband)\b/i;

export async function previewGroundedRemMarkdown(params: {
  workspaceDir: string;
  inputPaths: string[];
}): Promise<{
  workspaceDir: string;
  scannedFiles: number;
  files: Array<{
    path: string;
    facts: string[];
    candidates: string[];
  }>;
}> {
  const workspaceDir = params.workspaceDir.trim();
  const results = [];

  for (const inputPath of params.inputPaths) {
    const resolved = path.resolve(workspaceDir, inputPath);
    
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) continue;
      if (stat.size > 1024 * 1024) continue;
      
      const content = await fs.readFile(resolved, "utf-8");
      const lines = content.split("\n");
      
      const facts: string[] = [];
      const candidates: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("#")) continue;
        if (trimmed.startsWith("```")) continue;
        if (trimmed.startsWith("|")) continue;
        if (IMPORTANT_RE.test(trimmed)) {
          const clean = trimmed
            .replace(/^[-*+]\s+/, "")
            .replace(/\[[^\]]*\]\([^)]*\)/g, "")
            .trim();
          
          if (clean.length > 20) {
            facts.push(clean);
          }
        }
        if (trimmed.length < 100 && trimmed.length > 20) {
          candidates.push(trimmed);
        }
      }
      
      results.push({
        path: inputPath,
        facts: facts.slice(0, 10),
        candidates: candidates.slice(0, 10),
      });
      
    } catch {
      // Пропускаем файлы с ошибками
    }
  }
  
  return {
    workspaceDir,
    scannedFiles: results.length,
    files: results,
  };
}