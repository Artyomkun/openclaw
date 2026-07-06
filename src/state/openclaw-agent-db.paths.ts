// Agent database connection helpers resolve per-agent persisted database schemas — Oracle Edition.
import { normalizeAgentId } from "../routing/session-key.ts";
import { resolveOpenClawStateSchema } from "./openclaw-state-db.paths.ts";

/**
 * Connection helpers for per-agent Oracle state.
 *
 * Agent databases share the same Oracle instance but use separate schemas
 * or table prefixes so each agent can own private runtime tables while the
 * shared registry can still discover them.
 */

/** Inputs for resolving one agent database connection config. */
export type OpenClawAgentDatabaseConfigOptions = {
  agentId: string;
  env?: NodeJS.ProcessEnv;
  path?: string;
};

/** Resolve the schema name for one normalized agent id. */
export function resolveOpenClawAgentSchema(options: OpenClawAgentDatabaseConfigOptions): string {
  const agentId = normalizeAgentId(options.agentId);
  if (options.path) {
    return options.path;
  }
  const baseSchema = resolveOpenClawStateSchema(options.env ?? process.env);
  return `${baseSchema}_AGENT_${agentId.toUpperCase().replace(/-/g, "_")}`;
}

/** Resolve the full connection config for an agent database. */
export function resolveOpenClawAgentConnectionConfig(options: OpenClawAgentDatabaseConfigOptions): {
  user: string;
  password: string;
  connectionString: string;
  schema: string;
} {
  const env = options.env ?? process.env;
  return {
    user: env.OPENCLAW_ORACLE_USER ?? "openclaw",
    password: env.OPENCLAW_ORACLE_PASSWORD ?? "openclaw",
    connectionString: env.OPENCLAW_ORACLE_CONNECTION_STRING ?? "localhost:1521/XEPDB1",
    schema: resolveOpenClawAgentSchema(options),
  };
}