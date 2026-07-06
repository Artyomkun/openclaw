/**
 * Memory Core - Tools
 * 
 * Простые инструменты для поиска и чтения памяти.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core-host-engine-foundation";

export async function memorySearch(params: {
  cfg: OpenClawConfig;
  agentId: string;
  query: string;
  maxResults?: number;
  minScore?: number;
}) {
  const { getMemorySearchManager } = await import("./memory/manager.js");
  
  const manager = await getMemorySearchManager({
    cfg: params.cfg,
    agentId: params.agentId,
  });

  if (!manager) {
    return {
      error: "Memory search unavailable",
      results: [],
    };
  }

  try {
    const results = await manager.search(params.query, {
      maxResults: params.maxResults || 10,
      minScore: params.minScore || 0.5,
    });

    return {
      results,
      count: results.length,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      results: [],
    };
  }
}

export async function memoryRead(params: {
  cfg: OpenClawConfig;
  agentId: string;
  path: string;
  from?: number;
  lines?: number;
}) {
  const { getMemorySearchManager } = await import("./memory/manager.ts");
  
  const manager = await getMemorySearchManager({
    cfg: params.cfg,
    agentId: params.agentId,
  });

  if (!manager) {
    return {
      error: "Memory read unavailable",
      text: "",
    };
  }

  try {
    const result = await manager.readFile({
      relPath: params.path,
      from: params.from,
      lines: params.lines,
    });

    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      text: "",
    };
  }
}

// ========================================================================
// Tool wrappers
// ========================================================================

export function createMemorySearchTool(options: {
  cfg: OpenClawConfig;
  agentId: string;
}) {
  return {
    name: "memory_search",
    description: "Search memory for relevant information",
    parameters: {
      query: { type: "string", required: true },
      maxResults: { type: "number", default: 10 },
      minScore: { type: "number", default: 0.5 },
    },
    execute: async (params: any) => {
      return await memorySearch({
        cfg: options.cfg,
        agentId: options.agentId,
        query: params.query,
        maxResults: params.maxResults,
        minScore: params.minScore,
      });
    },
  };
}

export function createMemoryGetTool(options: {
  cfg: OpenClawConfig;
  agentId: string;
}) {
  return {
    name: "memory_get",
    description: "Read specific memory file",
    parameters: {
      path: { type: "string", required: true },
      from: { type: "number" },
      lines: { type: "number" },
    },
    execute: async (params: any) => {
      return await memoryRead({
        cfg: options.cfg,
        agentId: options.agentId,
        path: params.path,
        from: params.from,
        lines: params.lines,
      });
    },
  };
}