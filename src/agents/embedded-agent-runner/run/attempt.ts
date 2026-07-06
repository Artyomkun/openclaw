import { z } from "zod";
import fs from "node:fs/promises";

// ============================================
// SCHEMAS
// ============================================

const TriggerSchema = z.enum(["user", "manual", "heartbeat", "cron", "subagent"]);

const AttemptParamsSchema = z.object({
  runId: z.string(),
  sessionId: z.string(),
  sessionKey: z.string().optional(),
  provider: z.string(),
  modelId: z.string(),
  prompt: z.string(),
  workspaceDir: z.string(),
  config: z.unknown().optional(),
  trigger: TriggerSchema.optional(),
  timeoutMs: z.number().int().positive().default(30000),
  thinkLevel: z.string().optional(),
  reasoningLevel: z.string().optional(),
  toolsAllow: z.array(z.string()).optional(),
  disableTools: z.boolean().optional(),
  cwd: z.string().optional(),
  agentId: z.string().optional(),
  sessionFile: z.string(),
  model: z.object({
    api: z.string(),
    provider: z.string(),
    id: z.string(),
    contextWindow: z.number().optional(),
    maxTokens: z.number().optional(),
    input: z.array(z.string()).optional(),
    baseUrl: z.string().optional(),
  }),
  contextTokenBudget: z.number().optional(),
  messageChannel: z.string().optional(),
  messageProvider: z.string().optional(),
  agentAccountId: z.string().optional(),
  senderId: z.string().optional(),
  senderIsOwner: z.boolean().optional(),
  groupId: z.string().nullable().optional(),
  groupChannel: z.string().nullable().optional(),
  groupSpace: z.string().nullable().optional(),
  spawnedBy: z.string().nullable().optional(),
  sandboxSessionKey: z.string().optional(),
  skillsSnapshot: z.unknown().optional(),
  authStorage: z.unknown().optional(),
  modelRegistry: z.unknown().optional(),
  contextEngine: z.unknown().optional(),
  beforeAgentStartResult: z.unknown().optional(),
  abortSignal: z.instanceof(AbortSignal).optional(),
});

type AttemptParams = z.infer<typeof AttemptParamsSchema>;

// ============================================
// MAIN
// ============================================

export async function runEmbeddedAttempt(
  params: AttemptParams
): Promise<{
  status: "completed" | "aborted" | "error" | "blocked";
  error?: string;
  usage?: { input: number; output: number; total: number };
  messages: unknown[];
}> {
  const parsed = AttemptParamsSchema.safeParse(params);
  if (!parsed.success) {
    return {
      status: "error",
      error: `Invalid params: ${parsed.error.message}`,
      messages: [],
    };
  }

  const {
    runId,
    sessionId,
    provider,
    modelId,
    prompt,
    workspaceDir,
    trigger,
    sessionFile,
    model,
    abortSignal,
  } = parsed.data;

  console.log({
    event: "run.started",
    runId,
    sessionId,
    provider,
    model: modelId,
    trigger,
    workspaceDir,
  });

  try {
    let session = null;
    try {
      const sessionData = await fs.readFile(sessionFile, "utf-8");
      session = JSON.parse(sessionData);
    } catch {
      session = { messages: [], createdAt: Date.now() };
    }
    const userMessage = {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    session.messages.push(userMessage);
    const fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: session.messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      }),
    };

    if (abortSignal) {
      fetchOptions.signal = abortSignal;
    }

    const response = await fetch(
      `${model.baseUrl || "https://api.openai.com/v1"}/chat/completions`,
      fetchOptions
    );

    if (!response.ok) {
      throw new Error(`Model error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const assistantMessage = {
      role: "assistant",
      content: result.choices[0]?.message?.content || "",
      timestamp: Date.now(),
    };
    session.messages.push(assistantMessage);
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));

    console.log({
      event: "run.completed",
      runId,
      sessionId,
      durationMs: Date.now(),
      messageCount: session.messages.length,
    });

    return {
      status: "completed",
      usage: {
        input: result.usage?.prompt_tokens || 0,
        output: result.usage?.completion_tokens || 0,
        total: result.usage?.total_tokens || 0,
      },
      messages: session.messages,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error({
      event: "run.error",
      runId,
      sessionId,
      error: errorMessage,
    });

    return {
      status: "error",
      error: errorMessage,
      messages: [],
    };
  }
}