// OpenClaw agent database stores agent-scoped persisted runtime state — Oracle Edition.
import oracledb from "oracledb";
import { normalizeAgentId } from "../routing/session-key.ts";
import type { DB as OpenClawAgentKyselyDatabase } from "./openclaw-agent-db.generated.ts";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.generated.ts";
import type { DB as OpenClawStateKyselyDatabase } from "./openclaw-state-db.generated.ts";
import {
  runOpenClawStateWriteTransaction,
  type OpenClawStateDatabaseOptions,
} from "./openclaw-state-db.ts";

// ─── Constants ─────────────────────────────────────────────

const OPENCLAW_AGENT_SCHEMA_VERSION = 1;

// ─── Types ─────────────────────────────────────────────────

export type OpenClawAgentDatabase = {
  agentId: string;
  db: oracledb.Connection;
  path: string;
};

export type OpenClawAgentDatabaseOptions = OpenClawStateDatabaseOptions & {
  agentId: string;
};

type OpenClawAgentMetadataDatabase = Pick<OpenClawAgentKyselyDatabase, "schema_meta">;
type OpenClawAgentRegistryDatabase = Pick<OpenClawStateKyselyDatabase, "agent_databases">;

// ─── State ─────────────────────────────────────────────────

const cachedDatabases = new Map<string, OpenClawAgentDatabase>();

// ─── Schema Management ─────────────────────────────────────

interface ExistingSchemaMeta {
  agentId: string;
  role: string;
}

async function readExistingSchemaMeta(conn: oracledb.Connection): Promise<ExistingSchemaMeta> {
  try {
    const result = await conn.execute(
      `SELECT role, agent_id FROM schema_meta WHERE meta_key = 'primary'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const rows = result.rows as Array<{ ROLE: string; AGENT_ID: string }>;
    if (rows.length === 0) {
      throw new Error(`Agent database has no schema_meta row`);
    }
    return {
      role: rows[0].ROLE,
      agentId: rows[0].AGENT_ID,
    };
  } catch (err) {
    if ((err as Error & { errorNum?: number }).errorNum === 942) {
      // ORA-00942: table or view does not exist — first open, schema not created yet
      return { role: "agent", agentId: "" };
    }
    throw err;
  }
}

function assertExistingSchemaOwner(
  existing: ExistingSchemaMeta,
  agentId: string,
  pathname: string,
): void {
  if (existing.role !== "agent") {
    throw new Error(
      `OpenClaw agent database ${pathname} has schema role ${existing.role}; expected agent.`,
    );
  }
  if (!existing.agentId) {
    throw new Error(`OpenClaw agent database ${pathname} has no agent owner.`);
  }
  if (normalizeAgentId(existing.agentId) !== agentId) {
    throw new Error(
      `OpenClaw agent database ${pathname} belongs to agent ${existing.agentId}; requested agent ${agentId}.`,
    );
  }
}

async function ensureAgentSchema(conn: oracledb.Connection, agentId: string, pathname: string): Promise<void> {
  const existing = await readExistingSchemaMeta(conn);
  assertExistingSchemaOwner(existing, agentId, pathname);

  // Execute schema SQL (Oracle-adapted)
  const statements = OPENCLAW_AGENT_SCHEMA_SQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await conn.execute(stmt);
    } catch (err) {
      if ((err as Error & { errorNum?: number }).errorNum === 955) {
        // ORA-00955: object already exists — skip
        continue;
      }
      throw err;
    }
  }

  // Upsert schema meta
  const now = Date.now();
  await conn.execute(
    `MERGE INTO schema_meta dst
     USING (SELECT 'primary' AS meta_key FROM DUAL) src
        ON (dst.meta_key = src.meta_key)
      WHEN MATCHED THEN UPDATE SET
        role = 'agent',
        schema_version = :version,
        agent_id = :agentId,
        app_version = NULL,
        updated_at = :now
      WHEN NOT MATCHED THEN INSERT (
        meta_key, role, schema_version, agent_id, app_version, created_at, updated_at
      ) VALUES (
        'primary', 'agent', :version, :agentId, NULL, :now, :now
      )`,
    { version: OPENCLAW_AGENT_SCHEMA_VERSION, agentId, now },
  );
}

// ─── Agent Registration ────────────────────────────────────

async function registerAgentDatabase(params: {
  agentId: string;
  path: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const lastSeenAt = Date.now();

  await runOpenClawStateWriteTransaction(
    async (database) => {
      await database.db.execute(
        `MERGE INTO agent_databases dst
         USING (SELECT :agentId AS agent_id, :path AS path FROM DUAL) src
            ON (dst.agent_id = src.agent_id AND dst.path = src.path)
          WHEN MATCHED THEN UPDATE SET
            schema_version = :version,
            last_seen_at = :lastSeenAt
          WHEN NOT MATCHED THEN INSERT (
            agent_id, path, schema_version, last_seen_at
          ) VALUES (
            :agentId, :path, :version, :lastSeenAt
          )`,
        {
          agentId: params.agentId,
          path: params.path,
          version: OPENCLAW_AGENT_SCHEMA_VERSION,
          lastSeenAt,
        },
      );
    },
    { env: params.env },
  );
}

// ─── Public API ────────────────────────────────────────────

export async function ensureOpenClawAgentDatabaseSchema(
  conn: oracledb.Connection,
  options: OpenClawAgentDatabaseOptions & { register?: boolean },
): Promise<void> {
  const agentId = normalizeAgentId(options.agentId);
  await ensureAgentSchema(conn, agentId, options.path ?? `agent://${agentId}`);
  if (options.register) {
    await registerAgentDatabase({
      agentId,
      path: options.path ?? `agent://${agentId}`,
      env: options.env,
    });
  }
}

export async function openOpenClawAgentDatabase(
  options: OpenClawAgentDatabaseOptions,
): Promise<OpenClawAgentDatabase> {
  const agentId = normalizeAgentId(options.agentId);
  const pathname = options.path ?? `agent://${agentId}`;

  const cached = cachedDatabases.get(pathname);
  if (cached) {
    if (cached.agentId !== agentId) {
      throw new Error(
        `OpenClaw agent database ${pathname} is already open for agent ${cached.agentId}; requested agent ${agentId}.`,
      );
    }
    // Verify connection is still alive
    try {
      await cached.db.execute(`SELECT 1 FROM DUAL`);
    } catch {
      cachedDatabases.delete(pathname);
      return openOpenClawAgentDatabase(options);
    }
    await registerAgentDatabase({ agentId, path: pathname, env: options.env });
    return cached;
  }

  const conn = await oracledb.getConnection({
    user: process.env.OPENCLAW_ORACLE_USER ?? "openclaw",
    password: process.env.OPENCLAW_ORACLE_PASSWORD ?? "openclaw",
    connectionString: process.env.OPENCLAW_ORACLE_CONNECTION_STRING ?? "localhost:1521/XEPDB1",
  });

  try {
    await ensureAgentSchema(conn, agentId, pathname);
  } catch (err) {
    await conn.close();
    throw err;
  }

  const database: OpenClawAgentDatabase = { agentId, db: conn, path: pathname };
  cachedDatabases.set(pathname, database);
  await registerAgentDatabase({ agentId, path: pathname, env: options.env });

  return database;
}

export async function runOpenClawAgentWriteTransaction<T>(
  operation: (database: OpenClawAgentDatabase) => Promise<T>,
  options: OpenClawAgentDatabaseOptions,
): Promise<T> {
  const database = await openOpenClawAgentDatabase(options);
  try {
    const result = await operation(database);
    await database.db.commit();
    return result;
  } catch (err) {
    await database.db.rollback();
    throw err;
  }
}

export async function closeOpenClawAgentDatabasesForTest(): Promise<void> {
  for (const database of cachedDatabases.values()) {
    await database.db.close();
  }
  cachedDatabases.clear();
}