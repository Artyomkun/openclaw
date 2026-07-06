/**
 * Memory Core - Temporal Decay
 */

import fs from "node:fs/promises";
import path from "node:path";

// ========================================================================
// Constants
// ========================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// ========================================================================
// Types
// ========================================================================

export interface TemporalDecayConfig {
  enabled: boolean;
  halfLifeDays: number;
}

// ========================================================================
// Core
// ========================================================================

function getDateFromPath(filePath: string): Date | null {
  const match = filePath.match(/memory\/(\d{4})-(\d{2})-(\d{2})\.md$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);

  const date = new Date(Date.UTC(year, month, day));
  
  if (isNaN(date.getTime())) return null;
  
  return date;
}

async function getFileTimestamp(
  filePath: string,
  workspaceDir?: string
): Promise<Date | null> {
  const fromPath = getDateFromPath(filePath);
  if (fromPath) return fromPath;
  if (!workspaceDir) return null;

  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(workspaceDir, filePath);

  try {
    const stat = await fs.stat(fullPath);
    return new Date(stat.mtimeMs);
  } catch {
    return null;
  }
}

function getDecayMultiplier(ageDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0 || ageDays <= 0) return 1;
  
  const lambda = Math.LN2 / halfLifeDays;
  return Math.exp(-lambda * ageDays);
}

export async function applyTemporalDecay<T extends { path: string; score: number }>(
  results: T[],
  config: TemporalDecayConfig,
  workspaceDir?: string
): Promise<T[]> {
  if (!config.enabled || results.length === 0) {
    return results;
  }

  const now = Date.now();
  const cache = new Map<string, Date | null>();

  const decayed = await Promise.all(
    results.map(async (result) => {
      let date = cache.get(result.path);
      if (date === undefined) {
        date = await getFileTimestamp(result.path, workspaceDir);
        cache.set(result.path, date);
      }
      if (!date) return result;
      const ageDays = (now - date.getTime()) / DAY_MS;
      const multiplier = getDecayMultiplier(ageDays, config.halfLifeDays);

      return {
        ...result,
        score: result.score * multiplier,
      };
    })
  );

  return decayed;
}

// ========================================================================
// Export
// ========================================================================

export default {
  applyTemporalDecay,
  getDateFromPath,
  getFileTimestamp,
  getDecayMultiplier,
};