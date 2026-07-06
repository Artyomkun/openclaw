/**
 * Memory Core - REM Harness
 */

import fs from "node:fs/promises";
import path from "node:path";

// ========================================================================
// Ошибки
// ========================================================================

export class RemHarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemHarnessError';
  }
}

type RecallEntry = {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  totalScore: number;
  recallCount: number;
  lastRecalledAt: string;
};

async function readShortTermRecallEntries(params: {
  workspaceDir: string;
  nowMs?: number;
}): Promise<RecallEntry[]> {
  const filePath = path.join(params.workspaceDir, "memory", ".dreams", "recalls.json");
  
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    
    if (!data || typeof data !== 'object') {
      return [];
    }
    
    return Object.values(data).filter((entry): entry is RecallEntry => {
      return typeof entry === 'object' && entry !== null && 'path' in entry;
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
      return [];
    }
    throw new RemHarnessError(
      `Failed to read recalls: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

async function filterLiveShortTermRecallEntries(params: {
  workspaceDir: string;
  entries: RecallEntry[];
}): Promise<RecallEntry[]> {
  const alive: RecallEntry[] = [];
  
  for (const entry of params.entries) {
    const filePath = path.join(params.workspaceDir, entry.path);
    try {
      await fs.access(filePath);
      alive.push(entry);
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        continue;
      }
      throw new RemHarnessError(
        `Failed to access ${entry.path}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
  
  return alive;
}

// ========================================================================
// Простой REM Harness
// ========================================================================

export async function previewRemHarness(params: {
  workspaceDir: string;
  nowMs?: number;
}) {
  try {
    const nowMs = params.nowMs || Date.now();
    const recalls = await readShortTermRecallEntries({
      workspaceDir: params.workspaceDir,
      nowMs,
    });
    const alive = await filterLiveShortTermRecallEntries({
      workspaceDir: params.workspaceDir,
      entries: recalls,
    });
    const sorted = alive
      .filter(e => e.recallCount > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
    return {
      workspaceDir: params.workspaceDir,
      nowMs,
      recallCount: alive.length,
      topCandidates: sorted.map(e => ({
        path: e.path,
        snippet: e.snippet.substring(0, 100),
        score: e.totalScore,
        recalls: e.recallCount,
      })),
    };
  } catch (error) {
    if (error instanceof RemHarnessError) {
      throw error;
    }
    throw new RemHarnessError(
      `Failed to preview REM harness: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}