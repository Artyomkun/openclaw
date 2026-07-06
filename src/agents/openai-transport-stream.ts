import { z } from "zod";
import { OpenAI } from "openai";

const StreamConfig = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(z.any()),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  tools: z.array(z.any()).optional(),
  toolChoice: z.any().optional(),
});

type StreamConfig = z.infer<typeof StreamConfig>;

const ToolCall = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

const Chunk = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string() }),
  z.object({ type: z.literal("tool_call"), toolCalls: z.array(ToolCall) }),
  z.object({
    type: z.literal("usage"),
    usage: z.object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    }),
  }),
  z.object({ type: z.literal("done"), reason: z.string() }),
]);

export async function* streamOpenAI(config: StreamConfig) {
  const validated = StreamConfig.parse(config);
  const client = new OpenAI({ apiKey: validated.apiKey });

  const stream = await client.chat.completions.create({
    model: validated.model,
    messages: validated.messages,
    temperature: validated.temperature,
    max_tokens: validated.maxTokens,
    tools: validated.tools,
    tool_choice: validated.toolChoice,
    stream: true,
  });

  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;

    if (delta?.content) {
      yield Chunk.parse({ type: "text", content: delta.content });
    }

    if (delta?.tool_calls?.length) {
      yield Chunk.parse({ type: "tool_call", toolCalls: delta.tool_calls });
    }

    if (chunk.usage) {
      yield Chunk.parse({
        type: "usage",
        usage: {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
        },
      });
    }

    if (choice?.finish_reason) {
      yield Chunk.parse({ type: "done", reason: choice.finish_reason });
    }
  }
}