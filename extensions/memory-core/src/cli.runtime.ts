/**
 * Memory Core - CLI Commands
 * 
 * Простые CLI-команды для memory.
 * Полный рабочий код, без сов!
 */

import type { Command } from "commander";

type MemoryCommandOptions = {
  agent?: string;
  json?: boolean;
  force?: boolean;
  verbose?: boolean;
};

type MemorySearchOptions = MemoryCommandOptions & {
  query?: string;
  maxResults?: number;
  minScore?: number;
};

type MemoryPromoteOptions = MemoryCommandOptions & {
  limit?: number;
  minScore?: number;
  minRecallCount?: number;
  minUniqueQueries?: number;
  apply?: boolean;
};

function log(msg: string) {
  console.log(msg);
}

function error(msg: string) {
  console.error(`❌ ${msg}`);
}

function success(msg: string) {
  console.log(`✅ ${msg}`);
}

function info(msg: string) {
  console.log(`ℹ️ ${msg}`);
}

function warn(msg: string) {
  console.log(`⚠️ ${msg}`);
}

async function getManager(cfg: any, agentId?: string) {
  const { getMemorySearchManager } = await import("./cli.host.runtime.js");
  
  const result = await getMemorySearchManager({
    cfg,
    agentId: agentId || "default",
    purpose: "cli",
  });
  
  if (!result.manager) {
    throw new Error("Failed to initialize memory manager");
  }
  
  return result.manager;
}

async function getRuntimeConfig() {
  const { getRuntimeConfig } = await import("./cli.host.runtime.js");
  return getRuntimeConfig();
}

function resolveMemoryPluginConfig(cfg: any) {
  const entry = cfg.plugins?.entries?.["memory-core"];
  return entry?.config || {};
}

function resolveShortTermPromotionDreamingConfig(params: { pluginConfig: any; cfg: any }) {
  const pluginConfig = params;
  const dreaming = pluginConfig.dreaming || {};
  
  return {
    enabled: dreaming.enabled !== false,
    cron: dreaming.cron || "0 2 * * *",
    limit: dreaming.limit || 10,
    minScore: dreaming.minScore || 0.75,
    minRecallCount: dreaming.minRecallCount || 3,
    minUniqueQueries: dreaming.minUniqueQueries || 2,
    recencyHalfLifeDays: dreaming.recencyHalfLifeDays || 14,
    maxAgeDays: dreaming.maxAgeDays,
    maxPromotedSnippetTokens: dreaming.maxPromotedSnippetTokens || 200,
    timezone: dreaming.timezone,
  };
}

export async function runMemoryStatus(opts: MemoryCommandOptions) {
  try {
    const cfg = getRuntimeConfig();
    const manager = await getManager(cfg, opts.agent);
    const status = manager.status();
    
    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    log("\n📊 Memory Status\n");
    log(`  Provider:    ${status.provider}`);
    log(`  Model:       ${status.model || "N/A"}`);
    log(`  Files:       ${status.files}`);
    log(`  Chunks:      ${status.chunks}`);
    log(`  Dirty:       ${status.dirty ? "Yes" : "No"}`);
    log(`  Workspace:   ${status.workspaceDir}`);
    log(`  DB Path:     ${status.dbPath}`);
    
    if (status.sources?.length) {
      log(`  Sources:     ${status.sources.join(", ")}`);
    }
    
    if (status.fallback) {
      log(`  Fallback:    ${status.fallback.from} (${status.fallback.reason})`);
    }
    
    if (status.vector) {
      const vec = status.vector;
      log(`  Vector:      ${vec.enabled ? "Enabled" : "Disabled"} ${vec.available ? "✅" : "❌"}`);
      if (vec.dims) log(`  Vector dims: ${vec.dims}`);
    }
    
    if (status.cache) {
      log(`  Cache:       ${status.cache.enabled ? "Enabled" : "Disabled"}`);
      if (status.cache.entries) log(`  Cache entries: ${status.cache.entries}`);
    }
    
    if (status.batch) {
      log(`  Batch:       ${status.batch.enabled ? "Enabled" : "Disabled"}`);
      log(`  Batch failures: ${status.batch.failures}/${status.batch.limit}`);
    }
    
    log("");
  } catch (err) {
    error(`Status check failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

export async function runMemoryIndex(opts: MemoryCommandOptions) {
  try {
    const cfg = getRuntimeConfig();
    const manager = await getManager(cfg, opts.agent);
    
    info(`Indexing memory...${opts.force ? " (force)" : ""}`);
    
    const syncFn = manager.sync?.bind(manager);
    if (!syncFn) {
      error("Memory backend does not support manual reindex");
      process.exit(1);
    }
    
    await syncFn({
      reason: "cli",
      force: Boolean(opts.force),
    });
    
    success("Memory index updated");
  } catch (err) {
    error(`Index failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

export async function runMemorySearch(queryArg: string | undefined, opts: MemorySearchOptions) {
  const query = opts.query || queryArg;
  
  if (!query) {
    error("Missing search query");
    process.exit(1);
    return;
  }
  
  try {
    const cfg = getRuntimeConfig();
    const manager = await getManager(cfg, opts.agent);
    
    info(`Searching: "${query}"`);
    
    const results = await manager.search(query, {
      maxResults: opts.maxResults || 10,
      minScore: opts.minScore || 0.5,
    });
    
    if (opts.json) {
      console.log(JSON.stringify({ results }, null, 2));
      return;
    }
    
    if (results.length === 0) {
      log("\n📭 No matches found\n");
      return;
    }
    
    log(`\n📚 ${results.length} results:\n`);
    
    for (const result of results) {
      log(`  ${(result.score * 100).toFixed(1)}% | ${result.path}:${result.startLine}-${result.endLine}`);
      log(`     ${result.snippet.slice(0, 100)}${result.snippet.length > 100 ? "..." : ""}`);
      log("");
    }
  } catch (err) {
    error(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

export async function runMemoryPromote(opts: MemoryPromoteOptions) {
  try {
    const cfg = getRuntimeConfig();
    const manager = await getManager(cfg, opts.agent);
    
    const status = manager.status();
    const workspaceDir = status.workspaceDir;
    
    if (!workspaceDir) {
      error("No workspace directory found");
      process.exit(1);
    }
    
    info(`Checking for candidates in ${workspaceDir}...`);
    
    const pluginConfig = resolveMemoryPluginConfig(cfg);
    const dreaming = resolveShortTermPromotionDreamingConfig({ pluginConfig, cfg });
    const { rankShortTermPromotionCandidates } = await import("./short-term-promotion.js");
    
    const candidates = await rankShortTermPromotionCandidates({
      workspaceDir,
      limit: opts.limit || 10,
      minScore: opts.minScore || dreaming.minScore,
      minRecallCount: opts.minRecallCount || dreaming.minRecallCount,
      minUniqueQueries: opts.minUniqueQueries || dreaming.minUniqueQueries,
      recencyHalfLifeDays: dreaming.recencyHalfLifeDays,
      maxAgeDays: dreaming.maxAgeDays,
    });
    
    if (opts.json) {
      console.log(JSON.stringify({ candidates }, null, 2));
      return;
    }
    
    if (candidates.length === 0) {
      log("\n📭 No promotion candidates found\n");
      return;
    }
    
    log(`\n📊 ${candidates.length} candidates found:\n`);
    
    for (const c of candidates.slice(0, 10)) {
      log(`  ${(c.score * 100).toFixed(1)}% | ${c.snippet.slice(0, 60)}...`);
      log(`     recalls: ${c.recallCount}, path: ${c.path}`);
      log(`     components: freq=${c.components.frequency.toFixed(2)} rel=${c.components.relevance.toFixed(2)}`);
      log("");
    }
    if (opts.apply) {
      info("Applying candidates to MEMORY.md...");
      
      const { applyShortTermPromotions } = await import("./short-term-promotion.js");
      
      const result = await applyShortTermPromotions({
        workspaceDir,
        candidates,
        limit: opts.limit,
        minScore: opts.minScore || dreaming.minScore,
        minRecallCount: opts.minRecallCount || dreaming.minRecallCount,
        minUniqueQueries: opts.minUniqueQueries || dreaming.minUniqueQueries,
        maxAgeDays: dreaming.maxAgeDays,
        maxPromotedSnippetTokens: dreaming.maxPromotedSnippetTokens,
        timezone: dreaming.timezone,
      });
      
      success(`Applied ${result.applied} candidates`);
      success(`Appended ${result.appended} to MEMORY.md`);
      if (result.compactedSections > 0) {
        warn(`Compacted ${result.compactedSections} old sections`);
      }
    } else {
      log("💡 Use --apply to promote these candidates to MEMORY.md");
    }
  } catch (err) {
    error(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

export function registerMemoryCli(program: Command) {
  const memory = program
    .command("memory")
    .description("Search, inspect, and reindex memory files");
  
  // Status
  memory
    .command("status")
    .description("Show memory index status")
    .option("--agent <id>", "Agent id")
    .option("--json", "Print JSON")
    .option("--verbose", "Verbose logging")
    .action(runMemoryStatus);
  
  // Index
  memory
    .command("index")
    .description("Reindex memory files")
    .option("--agent <id>", "Agent id")
    .option("--force", "Force full reindex")
    .option("--verbose", "Verbose logging")
    .action(runMemoryIndex);
  
  // Search
  memory
    .command("search")
    .description("Search memory files")
    .argument("[query]", "Search query")
    .option("--query <text>", "Search query (alternative)")
    .option("--agent <id>", "Agent id")
    .option("--max-results <n>", "Max results", parseInt)
    .option("--min-score <n>", "Minimum score", parseFloat)
    .option("--json", "Print JSON")
    .action(runMemorySearch);
  
  // Promote
  memory
    .command("promote")
    .description("Rank and promote short-term recalls")
    .option("--agent <id>", "Agent id")
    .option("--limit <n>", "Max candidates", parseInt)
    .option("--min-score <n>", "Minimum score", parseFloat)
    .option("--min-recall-count <n>", "Min recall count", parseInt)
    .option("--min-unique-queries <n>", "Min unique queries", parseInt)
    .option("--apply", "Append selected candidates to MEMORY.md")
    .option("--json", "Print JSON")
    .action(runMemoryPromote);
  
  // Help
  memory.action(() => {
    memory.outputHelp();
    process.exitCode = 0;
  });
}