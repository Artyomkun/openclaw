// MCP stdio server exposes OpenClaw tools over the MCP stdio transport.
import { Server } from "@modelcontextprotocol/sdk/server/index.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.ts";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.ts";
import type { AnyAgentTool } from "../agents/tools/common.ts";
import { routeLogsToStderr } from "../logging/console.ts";
import { VERSION } from "../version.ts";
import { createPluginToolsMcpHandlers } from "./plugin-tools-handlers.ts";

export function createToolsMcpServer(params: { name: string; tools: AnyAgentTool[] }): Server {
  const handlers = createPluginToolsMcpHandlers(params.tools);
  const server = new Server(
    { name: params.name, version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, handlers.listTools);
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    return await handlers.callTool(request.params, extra.signal);
  });

  return server;
}

export async function connectToolsMcpServerToStdio(server: Server): Promise<void> {
  // MCP stdio requires stdout to stay protocol-only.
  routeLogsToStderr();

  const transport = new StdioServerTransport();
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.stdin.off("end", shutdown);
    process.stdin.off("close", shutdown);
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    void server.close();
  };

  process.stdin.once("end", shutdown);
  process.stdin.once("close", shutdown);
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await server.connect(transport);
}
