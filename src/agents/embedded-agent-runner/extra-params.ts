import { z } from "zod";
import { streamSimple } from "../../llm/stream.ts";
import type { StreamFn } from "../runtime/index.ts";

// ============================================
// SCHEMAS
// ============================================

const ExtraParamsSchema = z.object({
  temperature: z.number().optional(),
  topP: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  responseFormat: z.record(z.unknown()).optional(),
  transport: z.enum(["sse", "websocket", "auto"]).optional(),
  cachedContent: z.string().optional(),
  frequencyPenalty: z.number().optional(),
  presencePenalty: z.number().optional(),
  seed: z.number().int().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  parallelToolCalls: z.boolean().optional(),
  thinking: z.string().optional(),
});

type ExtraParams = z.infer<typeof ExtraParamsSchema>;

// ============================================
// MAIN
// ============================================

export function applyExtraParamsToAgent(
  agent: { streamFn?: StreamFn },
  extraParams: ExtraParams
): void {
  const parsed = ExtraParamsSchema.safeParse(extraParams);
  if (!parsed.success) {
    console.warn("Invalid extra params:", parsed.error.message);
    return;
  }

  const { temperature, topP, maxTokens, responseFormat, transport, cachedContent, frequencyPenalty, presencePenalty, seed, stop, parallelToolCalls, thinking } = parsed.data;

  const streamOptions = {
    temperature,
    topP,
    maxTokens,
    responseFormat,
    transport,
    cachedContent,
    frequencyPenalty,
    presencePenalty,
    seed,
    stop: stop ? (Array.isArray(stop) ? stop : [stop]) : undefined,
  };
  
  if (Object.values(streamOptions).some(v => v !== undefined)) {
    const baseStream = agent.streamFn ?? streamSimple;
    agent.streamFn = (model, context, options) => {
      return baseStream(model, context, {
        ...streamOptions,
        ...options,
      });
    };
  }

  // Parallel tool calls
  if (parallelToolCalls !== undefined) {
    const baseStream = agent.streamFn ?? streamSimple;
    agent.streamFn = (model, context, options) => {
      return baseStream(model, context, {
        ...options,
        parallel_tool_calls: parallelToolCalls,
      });
    };
  }

  // Thinking
  if (thinking) {
    const baseStream = agent.streamFn ?? streamSimple;
    agent.streamFn = (model, context, options) => {
      return baseStream(model, context, {
        ...options,
        thinking: { type: thinking },
      });
    };
  }
}