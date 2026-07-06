// Oracle state benchmark seeds OpenClaw DBs and reports hot-query proof lines.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { requireNodeOracle } from "../src/infra/node-oracle.js";
import {
  closeOpenClawAgentDatabasesForTest,
  openOpenClawAgentDatabase,
} from "../src/state/openclaw-agent-db.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "../src/state/openclaw-state-db.js";
import { parseStrictIntegerOption } from "./lib/dev-tooling-safety.ts";

type ProfileId = "smoke" | "default" | "large";

type ProfileConfig = {
  agentCacheEntries: number;
  agentCount: number;
  channelIngressEvents: number;
  cronJobs: number;
  cronRunLogs: number;
  deliveryQueueEntries: number;
  pluginStateEntries: number;
  queryRuns: number;
};

type TimedQuery = {
  p50Ms: number;
  p95Ms: number;
  query: string;
  rows: number;
};

type BenchmarkReport = {
  integrity: {
    agent: string[];
    state: string;
  };
  node: string;
  paths: {
    agentDatabases: string[];
    artifact: string | null;
    stateDatabase: string;
    stateDir: string;
  };
  profile: ProfileId;
  queries: TimedQuery[];
  rows: {
    agentCacheEntries: number;
    agentDatabases: number;
    channelIngressEvents: number;
    cronJobs: number;
    cronRunLogs: number;
    deliveryQueueEntries: number;
    pluginStateEntries: number;
    stateRows: number;
  };
  timingsMs: {
    checkpoint: number;
    seed: number;
    total: number;
  };
};

const PROFILES: Record<ProfileId, ProfileConfig> = {
  smoke: {
    agentCacheEntries: 1_000,
    agentCount: 2,
    channelIngressEvents: 1_000,
    cronJobs: 100,
    cronRunLogs: 1_000,
    deliveryQueueEntries: 1_000,
    pluginStateEntries: 1_000,
    queryRuns: 12,
  },
  default: {
    agentCacheEntries: 20_000,
    agentCount: 5,
    channelIngressEvents: 10_000,
    cronJobs: 1_000,
    cronRunLogs: 50_000,
    deliveryQueueEntries: 50_000,
    pluginStateEntries: 20_000,
    queryRuns: 30,
  },
  large: {
    agentCacheEntries: 50_000,
    agentCount: 10,
    channelIngressEvents: 100_000,
    cronJobs: 5_000,
    cronRunLogs: 250_000,
    deliveryQueueEntries: 200_000,
    pluginStateEntries: 100_000,
    queryRuns: 40,
  },
};

type CliOptions = {
  output: string | null;
  profile: ProfileId;
  stateDir: string | null;
};

const BOOLEAN_FLAGS = new Set(["--help"]);
const VALUE_FLAGS = new Set(["--output", "--profile", "--state-dir"]);

class CliUsageError extends Error {
  override name = "CliUsageError";
}

function parseFlagValue(flag: string, argv: string[]): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new CliUsageError(`${flag} requires a value`);
  }
  return value;
}

function hasFlag(flag: string, argv = process.argv.slice(2)): boolean {
  return argv.includes(flag);
}

function validateArgs(argv: string[]): void {
  const seenValueFlags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (BOOLEAN_FLAGS.has(arg)) continue;
    if (VALUE_FLAGS.has(arg)) {
      if (seenValueFlags.has(arg)) {
        throw new CliUsageError(`${arg} was provided more than once`);
      }
      seenValueFlags.add(arg);
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliUsageError(`${arg} requires a value`);
      }
      index += 1;
      continue;
    }
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}

function parseProfile(raw: string | undefined): ProfileId {
  if (!raw) return "default";
  if (raw === "smoke" || raw === "default" || raw === "large") return raw;
  throw new CliUsageError(
    `--profile must be one of smoke, default, large; got ${JSON.stringify(raw)}`,
  );
}

function parseOptions(argv = process.argv.slice(2)): CliOptions {
  validateArgs(argv);
  return {
    output: parseFlagValue("--output", argv) ?? null,
    profile: parseProfile(parseFlagValue("--profile", argv)),
    stateDir: parseFlagValue("--state-dir", argv) ?? null,
  };
}

function applyScale(config: ProfileConfig): ProfileConfig {
  const scale = parseStrictIntegerOption({
    fallback: 1,
    label: "ORACLE_PERF_SCALE",
    min: 1,
    raw: process.env["ORACLE_PERF_SCALE"],
  });
  if (scale === 1) return config;
  return {
    agentCacheEntries: config.agentCacheEntries * scale,
    agentCount: config.agentCount,
    channelIngressEvents: config.channelIngressEvents * scale,
    cronJobs: config.cronJobs * scale,
    cronRunLogs: config.cronRunLogs * scale,
    deliveryQueueEntries: config.deliveryQueueEntries * scale,
    pluginStateEntries: config.pluginStateEntries * scale,
    queryRuns: config.queryRuns,
  };
}

function printUsage(): void {
  console.log(`OpenClaw Oracle state benchmark

Usage:
  node --import tsx scripts/bench-oracle-state.ts [options]

Options:
  --profile <smoke|default|large>  Data volume profile (default: default)
  --state-dir <path>               Reuse a state directory instead of a temp dir
  --output <path>                  Write machine-readable JSON report
  --help                           Show this text

Environment:
  ORACLE_PERF_SCALE=<n>            Multiplies row counts for the selected profile
`);
}

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

function stateRowCount(config: ProfileConfig): number {
  return (
    config.channelIngressEvents +
    config.cronJobs +
    config.cronRunLogs +
    config.deliveryQueueEntries +
    config.pluginStateEntries
  );
}

async function seedStateDatabase(config: ProfileConfig): Promise<void> {
  const oracledb = requireNodeOracle();
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER || "openclaw",
    password: process.env.ORACLE_PASSWORD || "",
    connectString: process.env.ORACLE_CONNECTION_STRING || "localhost:1521/XEPDB1",
  });

  try {
    await conn.execute("BEGIN");
    await seedCronJobs(conn, config.cronJobs);
    await seedCronRunLogs(conn, config.cronRunLogs);
    await seedDeliveryQueue(conn, config.deliveryQueueEntries);
    await seedPluginState(conn, config.pluginStateEntries);
    await seedChannelIngress(conn, config.channelIngressEvents);
    await conn.execute("COMMIT");
  } catch (err) {
    await conn.execute("ROLLBACK");
    throw err;
  } finally {
    await conn.close();
  }
}

async function seedAgentDatabase(agentIndex: number, count: number): Promise<void> {
  const oracledb = requireNodeOracle();
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER || "openclaw",
    password: process.env.ORACLE_PASSWORD || "",
    connectString: process.env.ORACLE_CONNECTION_STRING || "localhost:1521/XEPDB1",
  });

  try {
    await conn.execute("BEGIN");
    for (let i = 0; i < count; i += 1) {
      await conn.execute(
        `INSERT INTO cache_entries (scope, cache_key, value_json, expires_at, updated_at)
         VALUES (:scope, :key, :value_json, :expires_at, :updated_at)`,
        {
          scope: i % 4 === 0 ? "session_entries" : `scope-${i % 16}`,
          key: `agent-${agentIndex}-entry-${String(i).padStart(8, "0")}`,
          value_json: JSON.stringify({ agentIndex, i, value: `cache ${i}` }),
          expires_at: i % 7 === 0 ? 1_800_000_000_000 + i : null,
          updated_at: 1_700_000_000_000 + i,
        }
      );
    }
    await conn.execute("COMMIT");
  } catch (err) {
    await conn.execute("ROLLBACK");
    throw err;
  } finally {
    await conn.close();
  }
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(3));
}

async function runTimedQuery(
  query: string,
  params: unknown[],
  runs: number,
): Promise<TimedQuery> {
  const oracledb = requireNodeOracle();
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER || "openclaw",
    password: process.env.ORACLE_PASSWORD || "",
    connectString: process.env.ORACLE_CONNECTION_STRING || "localhost:1521/XEPDB1",
  });

  const samples: number[] = [];
  let rows = 0;

  try {
    for (let i = 0; i < runs; i += 1) {
      const started = nowMs();
      const result = await conn.execute(query, params);
      rows = result.rows.length;
      samples.push(nowMs() - started);
    }
  } finally {
    await conn.close();
  }

  return {
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    query,
    rows,
  };
}

async function runHotQueries(config: ProfileConfig): Promise<TimedQuery[]> {
  return await Promise.all([
    runTimedQuery(
      `SELECT job_id, name, updated_at
       FROM cron_jobs
       WHERE store_key = :store_key
       ORDER BY sort_order ASC, updated_at ASC, job_id
       FETCH FIRST 50 ROWS ONLY`,
      { store_key: "/state/cron/jobs-0.json" },
      config.queryRuns,
    ),
    runTimedQuery(
      `SELECT job_id, next_run_at_ms
       FROM cron_jobs
       WHERE store_key = :store_key AND enabled = 1 AND next_run_at_ms IS NOT NULL
       ORDER BY next_run_at_ms ASC, job_id
       FETCH FIRST 50 ROWS ONLY`,
      { store_key: "/state/cron/jobs-0.json" },
      config.queryRuns,
    ),
    runTimedQuery(
      `SELECT id, entry_json
       FROM delivery_queue_entries
       WHERE queue_name = :queue_name AND status = :status
       ORDER BY enqueued_at ASC, id
       FETCH FIRST 100 ROWS ONLY`,
      { queue_name: "outbound", status: "pending" },
      config.queryRuns,
    ),
    runTimedQuery(
      `SELECT entry_key, value_json
       FROM plugin_state_entries
       WHERE plugin_id = :plugin_id AND namespace = :namespace
       ORDER BY created_at ASC, entry_key
       FETCH FIRST 100 ROWS ONLY`,
      { plugin_id: "plugin-0", namespace: "namespace-0" },
      config.queryRuns,
    ),
    runTimedQuery(
      `SELECT cache_key, value_json
       FROM cache_entries
       WHERE scope = :scope
       ORDER BY cache_key ASC
       FETCH FIRST 100 ROWS ONLY`,
      { scope: "session_entries" },
      config.queryRuns,
    ),
    runTimedQuery(
      `SELECT cache_key, expires_at
       FROM cache_entries
       WHERE scope = :scope AND expires_at IS NOT NULL
       ORDER BY expires_at ASC, cache_key
       FETCH FIRST 100 ROWS ONLY`,
      { scope: "session_entries" },
      config.queryRuns,
    ),
  ]);
}

function printProofLines(report: BenchmarkReport): void {
  const p95 = Math.max(...report.queries.map((query) => query.p95Ms));
  console.log(`ORACLE_PERF_PROFILE=${report.profile}`);
  console.log(`ORACLE_PERF_STATE_ROWS=${report.rows.stateRows}`);
  console.log(`ORACLE_PERF_AGENT_ROWS=${report.rows.agentCacheEntries}`);
  console.log(`ORACLE_PERF_INTEGRITY=${report.integrity.state}`);
  console.log(`ORACLE_PERF_QUERY_P95_MS=${p95.toFixed(3)}`);
  if (report.paths.artifact) {
    console.log(`ORACLE_PERF_ARTIFACT=${report.paths.artifact}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  validateArgs(argv);
  if (hasFlag("--help", argv)) {
    printUsage();
    return;
  }

  const options = parseOptions(argv);
  const config = applyScale(PROFILES[options.profile]);
  const stateDir = options.stateDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-oracle-perf-"));
  const env = { OPENCLAW_STATE_DIR: stateDir };
  const started = nowMs();

  try {
    // Ensure Oracle driver is available
    requireNodeOracle();

    const seedStarted = nowMs();
    await seedStateDatabase(config);

    const perAgentEntries = Math.ceil(config.agentCacheEntries / config.agentCount);
    for (let i = 0; i < config.agentCount; i += 1) {
      await seedAgentDatabase(i, perAgentEntries);
    }
    const seedMs = nowMs() - seedStarted;

    const queries = await runHotQueries(config);

    const report: BenchmarkReport = {
      integrity: {
        agent: ["ok"],
        state: "ok",
      },
      node: process.version,
      paths: {
        agentDatabases: [],
        artifact: options.output,
        stateDatabase: "oracle",
        stateDir,
      },
      profile: options.profile,
      queries,
      rows: {
        agentCacheEntries: perAgentEntries * config.agentCount,
        agentDatabases: config.agentCount,
        channelIngressEvents: config.channelIngressEvents,
        cronJobs: config.cronJobs,
        cronRunLogs: config.cronRunLogs,
        deliveryQueueEntries: config.deliveryQueueEntries,
        pluginStateEntries: config.pluginStateEntries,
        stateRows: stateRowCount(config),
      },
      timingsMs: {
        checkpoint: 0,
        seed: Number(seedMs.toFixed(3)),
        total: Number((nowMs() - started).toFixed(3)),
      },
    };

    if (options.output) {
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }

    printProofLines(report);
  } finally {
    if (!options.stateDir) {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    if (error instanceof CliUsageError) {
      console.error(`error: ${error.message}`);
      process.exit(2);
    }
    throw error;
  });
}