/**
 * Memory Core - Short Term Promotion
 * 
 * Простое продвижение часто искомых фрагментов в MEMORY.md
 * БЕЗ ПРОГЛАТЫВАНИЯ ОШИБОК!
 */

import fs from "node:fs/promises";
import path from "node:path";

export class ShortTermError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ShortTermError';
  }
}

type RecallEntry = {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  count: number;
  lastSeen: number;
};

class ShortTermStore {
  private data: Map<string, RecallEntry> = new Map();
  private filePath: string;

  constructor(workspaceDir: string) {
    this.filePath = path.join(workspaceDir, "memory", ".dreams", "recalls.json");
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      
      if (typeof parsed !== 'object' || parsed === null) {
        throw new ShortTermError('Invalid store format: expected object');
      }
      
      this.data = new Map(Object.entries(parsed));
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        this.data = new Map();
        return;
      }
      throw new ShortTermError(
        `Failed to load short-term store: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  async save() {
    try {
      const obj = Object.fromEntries(this.data);
      const dir = path.dirname(this.filePath);
      
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2));
    } catch (error) {
      throw new ShortTermError(
        `Failed to save short-term store: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  add(key: string, entry: Omit<RecallEntry, 'count' | 'lastSeen'>) {
    const existing = this.data.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = Date.now();
    } else {
      this.data.set(key, { 
        ...entry, 
        count: 1, 
        lastSeen: Date.now() 
      });
    }
  }

  getTop(count: number): RecallEntry[] {
    return Array.from(this.data.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, count);
  }
}

export async function recordShortTermRecalls(params: {
  workspaceDir: string;
  query: string;
  results: Array<{ path: string; startLine: number; endLine: number; snippet: string }>;
}) {
  try {
    const store = new ShortTermStore(params.workspaceDir);
    await store.load();

    for (const result of params.results) {
      const key = `${result.path}:${result.startLine}:${result.endLine}`;
      store.add(key, result);
    }

    await store.save();
  } catch (error) {
    throw new ShortTermError(
      `Failed to record short-term recalls: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

export async function promoteShortTermRecalls(params: {
  workspaceDir: string;
  minCount?: number;
  maxPromotions?: number;
}) {
  try {
    const minCount = params.minCount || 3;
    const maxPromotions = params.maxPromotions || 5;

    const store = new ShortTermStore(params.workspaceDir);
    await store.load();

    const top = store.getTop(maxPromotions * 2);
    const candidates = top.filter((e) => e.count >= minCount);

    if (candidates.length === 0) {
      return { promoted: 0 };
    }

    const memoryPath = path.join(params.workspaceDir, "MEMORY.md");
    let memory: string;
    
    try {
      memory = await fs.readFile(memoryPath, "utf-8");
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        memory = "";
      } else {
        throw new ShortTermError(
          `Failed to read MEMORY.md: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      }
    }

    const section = [
      "",
      `## Promoted From Short-Term Memory (${new Date().toISOString().slice(0, 10)})`,
      "",
      ...candidates.slice(0, maxPromotions).map((c) => {
        const source = `${c.path}:${c.startLine}-${c.endLine}`;
        const snippet = c.snippet.length > 200 ? c.snippet.substring(0, 200) + '...' : c.snippet;
        return `- ${snippet} [recalls=${c.count} source=${source}]`;
      }),
      "",
    ].join("\n");

    try {
      await fs.writeFile(memoryPath, memory + section);
    } catch (error) {
      throw new ShortTermError(
        `Failed to write MEMORY.md: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }

    return {
      promoted: candidates.slice(0, maxPromotions).length,
      candidates: candidates.slice(0, maxPromotions).map((c) => ({ 
        path: c.path, 
        count: c.count 
      })),
    };
  } catch (error) {
    if (error instanceof ShortTermError) {
      throw error;
    }
    throw new ShortTermError(
      `Failed to promote short-term recalls: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}