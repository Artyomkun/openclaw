/**
 * OpenClaw-owned agent runtime facade.
 *
 * Wires agent-core to the plugin SDK LLM runtime and re-exports reusable runtime helpers.
 */
import {
  Agent as CoreAgent,
  type AgentOptions as CoreAgentOptions,
} from "../../../packages/agent-core/src/agent.ts";
import type { AgentCoreRuntimeDeps } from "../../../packages/agent-core/src/runtime-deps.ts";
import type { CompleteSimpleFn, StreamFn } from "../../../packages/llm-core/src/index.ts";
import { completeSimple, streamSimple } from "../../plugin-sdk/llm.ts";

export const openClawAgentCoreRuntime = {
  completeSimple: completeSimple as unknown as CompleteSimpleFn,
  streamSimple: streamSimple as unknown as StreamFn,
} satisfies AgentCoreRuntimeDeps;

export class Agent extends CoreAgent {
  constructor(options: CoreAgentOptions = {}) {
    super({ runtime: openClawAgentCoreRuntime, ...options });
  }
}

// OpenClaw-owned reusable agent core
export * from "../../../packages/agent-core/src/index.ts";
// Proxy utilities
export * from "./proxy.ts";
