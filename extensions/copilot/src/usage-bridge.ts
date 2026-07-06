// Copilot plugin module implements usage bridge behavior.
import type { AgentMessage, NormalizedUsage } from "openclaw/plugin-sdk/agent-harness-runtime";

type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

type CopilotUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

function normalizeCopilotUsage(data: CopilotUsage | undefined): NormalizedUsage | undefined {
  if (!data) return undefined;
  const input = data.inputTokens ?? 0;
  const output = data.outputTokens ?? 0;
  const cacheRead = data.cacheReadTokens ?? 0;
  const cacheWrite = data.cacheWriteTokens ?? 0;

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  };
}

export function buildCopilotAssistantUsage(params: {
  usage?: NormalizedUsage;
  fallbackOutputTokens?: number;
}): AssistantMessage["usage"] {
  const usage = params.usage ?? normalizeCopilotUsage({ outputTokens: params.fallbackOutputTokens });

  return {
    cacheRead: usage?.cacheRead ?? 0,
    cacheWrite: usage?.cacheWrite ?? 0,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
    input: usage?.input ?? 0,
    output: usage?.output ?? 0,
    totalTokens: usage?.total ?? 0,
  };
}