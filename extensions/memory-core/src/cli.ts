/**
 * Memory Core - CLI Commands
 */

import type { Command } from "commander";
import { formatDocsLink, formatHelpExamples, theme } from "openclaw/plugin-sdk/memory-core-host-runtime-cli";

let runtimePromise: Promise<any> | null = null;

async function loadRuntime() {
  runtimePromise ??= import("./cli.runtime.ts");
  return await runtimePromise;
}

async function runCommand(name: string, opts: any) {
  const runtime = await loadRuntime();
  const fn = runtime[`runMemory${name}`];
  if (!fn) throw new Error(`Unknown command: ${name}`);
  return fn(opts);
}

function parseNumber(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error(`Invalid number: ${value}`);
  return num;
}

function parsePositiveInt(value: string): number {
  const num = parseInt(value, 10);
  if (num <= 0) throw new Error(`Must be positive: ${value}`);
  return num;
}

export function registerMemoryCli(program: Command) {
  const memory = program
    .command("memory")
    .description("Search, inspect, and reindex memory files")
    .addHelpText("after", () =>
      `\n${theme.heading("Examples:")}\n${formatHelpExamples([
        ["openclaw memory status", "Show index status"],
        ["openclaw memory index --force", "Force full reindex"],
        ['openclaw memory search "meeting"', "Search memory"],
        ["openclaw memory promote --apply", "Promote candidates to MEMORY.md"],
        ["openclaw memory status --json", "JSON output for scripts"],
      ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/memory", "docs.openclaw.ai/cli/memory")}\n`
    );

  // Status
  memory
    .command("status")
    .description("Show memory index status")
    .option("--agent <id>", "Agent id")
    .option("--json", "Print JSON")
    .option("--deep", "Probe embedding")
    .option("--fix", "Repair stale locks")
    .action(async (opts) => { await runCommand("Status", opts); });

  // Index
  memory
    .command("index")
    .description("Reindex memory files")
    .option("--agent <id>", "Agent id")
    .option("--force", "Force full reindex")
    .action(async (opts) => { await runCommand("Index", opts); });

  // Search
  memory
    .command("search")
    .description("Search memory")
    .argument("[query]", "Search query")
    .option("--query <text>", "Search query (alternative)")
    .option("--agent <id>", "Agent id")
    .option("--max-results <n>", "Max results", parsePositiveInt)
    .option("--min-score <n>", "Min score", parseNumber)
    .option("--json", "Print JSON")
    .action(async (queryArg, opts) => { await runCommand("Search", { ...opts, query: queryArg || opts.query }); });

  // Promote
  memory
    .command("promote")
    .description("Rank and promote short-term recalls")
    .option("--agent <id>", "Agent id")
    .option("--limit <n>", "Max candidates", parsePositiveInt)
    .option("--min-score <n>", "Min score", parseNumber)
    .option("--apply", "Append to MEMORY.md")
    .option("--json", "Print JSON")
    .action(async (opts) => { await runCommand("Promote", opts); });

  // Promote Explain
  memory
    .command("promote-explain")
    .description("Explain promotion candidate")
    .argument("<selector>", "Candidate key or snippet")
    .option("--agent <id>", "Agent id")
    .option("--json", "Print JSON")
    .action(async (selector, opts) => { await runCommand("PromoteExplain", { ...opts, selector }); });

  // REM Harness
  memory
    .command("rem-harness")
    .description("Preview REM reflections")
    .option("--agent <id>", "Agent id")
    .option("--path <file-or-dir>", "Historical files")
    .option("--grounded", "Render grounded preview")
    .option("--json", "Print JSON")
    .action(async (opts) => { await runCommand("RemHarness", opts); });

  // REM Backfill
  memory
    .command("rem-backfill")
    .description("Write historical REM entries to DREAMS.md")
    .option("--agent <id>", "Agent id")
    .option("--path <file-or-dir>", "Historical files")
    .option("--rollback", "Remove entries")
    .option("--json", "Print JSON")
    .action(async (opts) => { await runCommand("RemBackfill", opts); });

  memory.action(() => { memory.outputHelp(); process.exitCode = 0; });
}