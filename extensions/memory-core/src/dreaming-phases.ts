/**
 * Memory Core - Dreaming Phases
 * 
 * Простое управление фазами сновидений.
 * ВСЁ В ОДНОМ ФАЙЛЕ, НО ПРОСТО.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { formatMemoryDreamingDay } from "openclaw/plugin-sdk/memory-core-host-status";

type Logger = { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
type Config = {
  enabled: boolean;
  lookbackDays: number;
  limit: number;
  timezone?: string;
};

type RecallEntry = {
  key: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  recallCount: number;
  totalScore: number;
  conceptTags: string[];
  lastRecalledAt: string;
};

const STORE_PATH = "memory/.dreams/recalls.json";

async function readRecalls(workspaceDir: string): Promise<RecallEntry[]> {
  const filePath = path.join(workspaceDir, STORE_PATH);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return Object.values(data).filter((e: any) => e.path && e.snippet);
  } catch {
    return [];
  }
}

async function extractSnippets(workspaceDir: string, lookbackDays: number): Promise<RecallEntry[]> {
  const all = await readRecalls(workspaceDir);
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  
  return all
    .filter(e => new Date(e.lastRecalledAt).getTime() > cutoff)
    .sort((a, b) => b.recallCount - a.recallCount)
    .slice(0, 20);
}

export async function runLightDreaming(params: {
  workspaceDir: string;
  config: Config;
  logger: Logger;
}): Promise<void> {
  const { workspaceDir, config, logger } = params;
  
  if (!config.enabled || config.limit === 0) {
    logger.info("Light dreaming disabled");
    return;
  }

  const entries = await extractSnippets(workspaceDir, config.lookbackDays);
  
  if (entries.length === 0) {
    logger.info("No entries for light dreaming");
    return;
  }

  const capped = entries.slice(0, config.limit);
  const day = formatMemoryDreamingDay(Date.now(), config.timezone);
  const content = [
    `## Light Sleep (${day})`,
    "",
    ...capped.map(e => `- ${e.snippet.slice(0, 200)} [${e.path}]`),
    "",
  ].join("\n");

  const filePath = path.join(workspaceDir, "memory", `${day}.md`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, content);

  logger.info(`Light dreaming: ${capped.length} entries written`);
}

// ========================================================================
// REM СОН
// ========================================================================

export async function runRemDreaming(params: {
  workspaceDir: string;
  config: Config;
  logger: Logger;
}): Promise<void> {
  const { workspaceDir, config, logger } = params;
  
  if (!config.enabled || config.limit === 0) {
    logger.info("REM dreaming disabled");
    return;
  }

  const entries = await extractSnippets(workspaceDir, config.lookbackDays);
  
  if (entries.length === 0) {
    logger.info("No entries for REM dreaming");
    return;
  }

  const tags = new Map<string, number>();
  for (const e of entries) {
    for (const tag of e.conceptTags || []) {
      tags.set(tag, (tags.get(tag) || 0) + 1);
    }
  }

  const sortedTags = [...tags.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const day = formatMemoryDreamingDay(Date.now(), config.timezone);
  
  const content = [
    `## REM Sleep (${day})`,
    "",
    "### Patterns",
    ...sortedTags.map(([tag, count]) => `- ${tag}: ${count} occurrences`),
    "",
    "### Candidate truths",
    ...entries.slice(0, 5).map(e => `- ${e.snippet.slice(0, 150)}`),
    "",
  ].join("\n");

  const filePath = path.join(workspaceDir, "memory", `${day}.md`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, content);

  logger.info(`REM dreaming: ${entries.length} entries processed`);
}

export async function runDreamingSweep(params: {
  workspaceDir: string;
  pluginConfig?: Record<string, unknown>;
  logger: Logger;
}): Promise<void> {
  const { workspaceDir, logger } = params;
  
  const lightConfig: Config = {
    enabled: true,
    lookbackDays: 7,
    limit: 10,
  };
  
  const remConfig: Config = {
    enabled: true,
    lookbackDays: 14,
    limit: 8,
  };

  await runLightDreaming({ workspaceDir, config: lightConfig, logger });
  await runRemDreaming({ workspaceDir, config: remConfig, logger });
}

export default {
  runLightDreaming,
  runRemDreaming,
  runDreamingSweep,
};