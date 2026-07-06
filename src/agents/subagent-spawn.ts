// subagent-spawn.ts
import { z } from "zod";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { 
  loadSessionStore,
  resolveInternalSessionKey,
  resolveMainSessionAlias
} from "./subagent-spawn.runtime.ts";

// ============================================
// SCHEMAS
// ============================================

const SpawnMode = z.enum(["run", "session"]);
const CleanupMode = z.enum(["delete", "keep"]);
const SandboxMode = z.enum(["require", "inherit"]);
const ContextMode = z.enum(["fork", "isolated"]);

const AttachmentSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  encoding: z.enum(["utf8", "base64"]).optional(),
  mimeType: z.string().optional(),
});

const SpawnParamsSchema = z.object({
  task: z.string().min(1),
  label: z.string().optional(),
  agentId: z.string().optional(),
  model: z.string().optional(),
  taskName: z.string().optional(),
  thinking: z.string().optional(),
  cwd: z.string().optional(),
  runTimeoutSeconds: z.number().int().positive().optional(),
  thread: z.boolean().optional(),
  mode: SpawnMode.optional(),
  cleanup: CleanupMode.optional(),
  sandbox: SandboxMode.optional(),
  context: ContextMode.optional(),
  lightContext: z.boolean().optional(),
  expectsCompletionMessage: z.boolean().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  attachMountPath: z.string().optional(),
});

const SpawnContextSchema = z.object({
  agentSessionKey: z.string().optional(),
  completionOwnerKey: z.string().optional(),
  agentChannel: z.string().optional(),
  agentAccountId: z.string().optional(),
  agentTo: z.string().optional(),
  agentThreadId: z.union([z.string(), z.number()]).optional(),
  agentGroupId: z.string().nullable().optional(),
  agentGroupChannel: z.string().nullable().optional(),
  agentGroupSpace: z.string().nullable().optional(),
  agentMemberRoleIds: z.array(z.string()).optional(),
  requesterAgentIdOverride: z.string().optional(),
  workspaceDir: z.string().optional(),
  inheritedToolAllowlist: z.array(z.string()).optional(),
  inheritedToolDenylist: z.array(z.string()).optional(),
});

type SpawnParams = z.infer<typeof SpawnParamsSchema>;
type SpawnContext = z.infer<typeof SpawnContextSchema>;

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_MAX_SPAWN_DEPTH = 10;
const DEFAULT_MAX_CHILDREN_PER_AGENT = 5;
const AGENT_LANE_SUBAGENT = "subagent";

// ============================================
// HELPERS
// ============================================

function isValidAgentId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id);
}

function normalizeAgentId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function summarizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function resolveUserPath(p: string): string {
  return p.replace(/^~/, process.env.HOME || "");
}

function splitModelRef(ref: string): { provider?: string; model?: string } {
  const parts = ref.split("/");
  if (parts.length === 2) {
    return { provider: parts[0], model: parts[1] };
  }
  return { model: ref };
}

// ============================================
// MAIN
// ============================================

export async function spawnSubagentDirect(
  params: SpawnParams,
  ctx: SpawnContext
) {
  // 1. Валидация
  const parsed = SpawnParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { status: "error", error: `Invalid params: ${parsed.error.message}` };
  }

  const { 
    task, 
    agentId, 
    model: modelOverride, 
    thread: requestThreadBinding, 
    mode, 
    cleanup, 
    sandbox, 
    context, 
    attachments,
    runTimeoutSeconds,
    taskName,
    thinking: thinkingOverrideRaw,
    cwd,
    ...rest 
  } = parsed.data;

  // 2. Проверка agentId
  if (agentId && !isValidAgentId(agentId)) {
    return { 
      status: "error", 
      error: `Invalid agentId: ${agentId}` 
    };
  }

  const requesterAgentId = ctx.requesterAgentIdOverride || "default";
  const targetAgentId = agentId ? normalizeAgentId(agentId) : requesterAgentId;

  // 3. Режимы
  const spawnMode = mode || (requestThreadBinding ? "session" : "run");
  const cleanupMode = cleanup || (spawnMode === "session" ? "keep" : "keep");
  const contextMode = context || (requestThreadBinding ? "fork" : "isolated");

  const SpawnMode = z.enum(["run", "session"]);
  const CleanupMode = z.enum(["delete", "keep"]);
  const ContextMode = z.enum(["fork", "isolated"]);

  // Валидация режимов через Zod
  const modeValidation = SpawnMode.safeParse(spawnMode);
  if (!modeValidation.success) {
    return { status: "error", error: `Invalid mode: ${modeValidation.error.message}` };
  }

  const cleanupValidation = CleanupMode.safeParse(cleanupMode);
  if (!cleanupValidation.success) {
    return { status: "error", error: `Invalid cleanup: ${cleanupValidation.error.message}` };
  }

  const contextValidation = ContextMode.safeParse(contextMode);
  if (!contextValidation.success) {
    return { status: "error", error: `Invalid context: ${contextValidation.error.message}` };
  }

  if (spawnMode === "session" && !requestThreadBinding) {
    return {
      status: "error",
      error: 'mode="session" requires thread=true'
    };
  }

  // 4. Глубина и дети
  const { mainKey, alias } = resolveMainSessionAlias(cfg);
  const requesterInternalKey = ctx.agentSessionKey
    ? resolveInternalSessionKey({ key: ctx.agentSessionKey, alias, mainKey })
    : alias;

  const sessionStore = await loadSessionStore(cfg);
  const requesterEntry = sessionStore[requesterInternalKey];
  const currentDepth = requesterEntry?.spawnDepth ?? 0;
  const maxDepth = cfg.agents?.defaults?.subagents?.maxSpawnDepth ?? DEFAULT_MAX_SPAWN_DEPTH;

  if (currentDepth >= maxDepth) {
    return { 
      status: "forbidden", 
      error: `Max spawn depth ${maxDepth} reached (current: ${currentDepth})` 
    };
  }

  const childrenCount = Object.values(sessionStore)
    .filter((entry: any) => entry.spawnedBy === requesterInternalKey && entry.status !== "closed")
    .length;
  const maxChildren = cfg.agents?.defaults?.subagents?.maxChildrenPerAgent ?? DEFAULT_MAX_CHILDREN_PER_AGENT;

  if (childrenCount >= maxChildren) {
    return { 
      status: "forbidden", 
      error: `Max active children ${maxChildren} reached (current: ${childrenCount})` 
    };
  }

  // 5. Model
  let resolvedModel: string | undefined;
  let thinkingOverride = thinkingOverrideRaw;

  if (modelOverride) {
    const { model } = splitModelRef(modelOverride);
    resolvedModel = model || modelOverride;
  } else {
    resolvedModel = "gpt-4";
  }

  // 6. CWD
  const requestedCwd = cwd ? resolveUserPath(cwd) : undefined;
  const spawnedWorkspaceDir = ctx.workspaceDir;

  // 7. Сессия
  const childSessionKey = `agent:${targetAgentId}:subagent:${crypto.randomUUID()}`;
  const childIdem = crypto.randomUUID();
  let childRunId = childIdem;
  let threadBindingReady = false;
  let attachmentAbsDir: string | undefined;
  let attachmentsReceipt = null;

  try {
    // 8. Attachments
    if (attachments?.length) {
      const dir = path.join("/tmp/subagent-attachments", crypto.randomUUID());
      await fs.mkdir(dir, { recursive: true });
      
      const files = [];
      let totalBytes = 0;
      
      for (const att of attachments) {
        const filePath = path.join(dir, att.name);
        const content = att.encoding === "base64" 
          ? Buffer.from(att.content, "base64") 
          : Buffer.from(att.content, "utf8");
        
        await fs.writeFile(filePath, content);
        totalBytes += content.length;
        files.push({
          name: att.name,
          bytes: content.length,
          sha256: crypto.createHash("sha256").update(content).digest("hex"),
        });
      }
      
      attachmentAbsDir = dir;
      attachmentsReceipt = {
        count: attachments.length,
        totalBytes,
        files,
        relDir: dir,
      };
    }

    // 9. Thread binding
    if (requestThreadBinding) {
      const bindResponse = await fetch(`${process.env.GATEWAY_URL}/v1/sessions/bind`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GATEWAY_TOKEN}`,
        },
        body: JSON.stringify({
          targetSessionKey: childSessionKey,
          targetKind: "subagent",
          conversation: {
            channel: ctx.agentChannel,
            accountId: ctx.agentAccountId || "default",
            conversationId: ctx.agentThreadId 
              ? String(ctx.agentThreadId) 
              : ctx.agentTo || "",
            ...(ctx.agentGroupId ? { parentConversationId: ctx.agentGroupId } : {}),
          },
          placement: "child",
          metadata: {
            threadName: `${targetAgentId} subagent`,
            agentId: targetAgentId,
            label: rest.label || undefined,
            boundBy: "system",
            introText: `Subagent spawned for ${targetAgentId}`,
          },
        }),
      });

      if (!bindResponse.ok) {
        const errorText = await bindResponse.text();
        throw new Error(`Thread bind failed: ${errorText}`);
      }

      const bindResult = await bindResponse.json();
      threadBindingReady = true;
      
      if (bindResult.deliveryOrigin) {
        deliveryOrigin = {
          channel: bindResult.deliveryOrigin.channel || ctx.agentChannel,
          to: bindResult.deliveryOrigin.to || ctx.agentTo,
          accountId: bindResult.deliveryOrigin.accountId || ctx.agentAccountId,
        };
      }
    }

    // 10. System prompt
    const childSystemPrompt = [
      `You are a subagent for "${targetAgentId}".`,
      `Task: ${task}`,
      spawnedWorkspaceDir ? `Workspace: ${spawnedWorkspaceDir}` : "",
      requestedCwd ? `CWD: ${requestedCwd}` : "",
      `Depth: ${currentDepth + 1}/${maxDepth}`,
      `Mode: ${spawnMode}`,
      attachments?.length ? `Attachments: ${attachments.length} files` : "",
    ].filter(Boolean).join("\n");

    // 11. Запуск через gateway
    const response = await fetch(`${process.env.GATEWAY_URL}/v1/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        message: task,
        sessionKey: childSessionKey,
        channel: ctx.agentChannel,
        to: ctx.agentTo,
        accountId: ctx.agentAccountId,
        threadId: ctx.agentThreadId,
        idempotencyKey: childIdem,
        deliver: threadBindingReady,
        lane: AGENT_LANE_SUBAGENT,
        disableMessageTool: true,
        extraSystemPrompt: childSystemPrompt,
        thinking: thinkingOverride,
        timeout: runTimeoutSeconds || 60,
        label: rest.label || undefined,
        cleanupBundleMcpOnRunEnd: spawnMode !== "session",
        ...(rest.lightContext ? { bootstrapContextMode: "lightweight" } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const runId = result.runId || childIdem;
    childRunId = runId;

    // 12. Логирование
    console.log({
      event: "subagent_spawned",
      childSessionKey,
      runId: childRunId,
      agentId: targetAgentId,
      mode: spawnMode,
      resolvedModel,
    });

    return {
      status: "accepted",
      childSessionKey,
      runId: childRunId,
      mode: spawnMode,
      taskName: taskName || "subagent",
      note: threadBindingReady ? "Subagent spawned in thread" : "Subagent spawned",
      resolvedModel: resolvedModel || undefined,
      resolvedProvider: resolvedModel ? splitModelRef(resolvedModel).provider : undefined,
      modelApplied: !!resolvedModel,
      attachments: attachmentsReceipt || undefined,
    };

  } catch (err) {
    if (attachmentAbsDir) {
      await fs.rm(attachmentAbsDir, { recursive: true, force: true });
    }
    
    return {
      status: "error",
      error: `Failed: ${summarizeError(err)}`,
      childSessionKey,
      runId: childRunId,
    };
  }
}

// ============================================
// EXPORTS
// ============================================

export { 
  SpawnParamsSchema, 
  SpawnContextSchema,
  SpawnMode,
  CleanupMode,
  SandboxMode,
  ContextMode,
};