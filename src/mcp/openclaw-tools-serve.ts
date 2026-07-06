/**
 * Standalone MCP server for selected built-in OpenClaw tools.
 *
 * Run via: node --import tsx src/mcp/openclaw-tools-serve.ts
 * Or: bun src/mcp/openclaw-tools-serve.ts
 */
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.ts";
import type { AnyAgentTool } from "../agents/tools/common.ts";
import { createCronTool } from "../agents/tools/cron-tool.ts";
import { formatErrorMessage } from "../infra/errors.ts";
import { connectToolsMcpServerToStdio, createToolsMcpServer } from "./tools-stdio-server.ts";

export const OPENCLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV = "OPENCLAW_TOOLS_MCP_AGENT_SESSION_KEY";

export function resolveOpenClawToolsMcpAgentSessionKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[OPENCLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV]?.trim() || undefined;
}

export function resolveOpenClawToolsForMcp(
  params: {
    agentSessionKey?: string;
  } = {},
): AnyAgentTool[] {
  const agentSessionKey = (
    params.agentSessionKey ?? resolveOpenClawToolsMcpAgentSessionKey()
  )?.trim();
  if (!agentSessionKey) {
    throw new Error(`${OPENCLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV} is required`);
  }
  return [createCronTool({ agentSessionKey, creatorToolAllowlist: [{ name: "cron" }] })];
}

function createOpenClawToolsMcpServer(
  params: {
    tools?: AnyAgentTool[];
  } = {},
): Server {
  const tools = params.tools ?? resolveOpenClawToolsForMcp();
  return createToolsMcpServer({ name: "openclaw-tools", tools });
}

async function serveOpenClawToolsMcp(): Promise<void> {
  const server = createOpenClawToolsMcpServer();
  await connectToolsMcpServerToStdio(server);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  serveOpenClawToolsMcp().catch((err: unknown) => {
    process.stderr.write(`openclaw-tools-serve: ${formatErrorMessage(err)}\n`);
    process.exit(1);
  });
}
