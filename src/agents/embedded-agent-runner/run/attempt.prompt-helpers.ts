import { z } from "zod";
import type { OpenClawConfig } from "../../../config/types.openclaw.ts";

// ============================================
// SCHEMAS
// ============================================

const TriggerSchema = z.enum(["user", "manual", "heartbeat", "cron", "subagent"]);
type Trigger = z.infer<typeof TriggerSchema>;

const HookResultSchema = z.object({
  systemPrompt: z.string().optional(),
  prependContext: z.string().optional(),
  appendContext: z.string().optional(),
  prependSystemContext: z.string().optional(),
  appendSystemContext: z.string().optional(),
});

// ============================================
// PROMPT BUILD
// ============================================

export async function resolvePromptBuildHookResult(params: {
  prompt: string;
  messages: unknown[];
  sessionKey?: string;
  agentId?: string;
  trigger?: Trigger;
  config?: OpenClawConfig;
}): Promise<z.infer<typeof HookResultSchema>> {
  const { trigger, sessionKey, config } = params;
  
  const isHeartbeat = trigger === "heartbeat";
  const isSubagent = sessionKey?.startsWith("agent:") ?? false;

  let systemPrompt = isHeartbeat ? "Heartbeat prompt" : "";
  let prependContext = isSubagent ? "[Subagent context]" : "";
  let appendContext = "";
  let prependSystemContext = "";
  let appendSystemContext = "";

  if (config?.plugins?.entries) {
    for (const plugin of config.plugins.entries) {
      if (plugin.beforePromptBuild) {
        const result = await plugin.beforePromptBuild({
          prompt: params.prompt,
          messages: params.messages,
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          trigger: params.trigger,
        });
        
        if (result?.systemPrompt) systemPrompt += `\n${result.systemPrompt}`;
        if (result?.prependContext) prependContext += `\n${result.prependContext}`;
        if (result?.appendContext) appendContext += `\n${result.appendContext}`;
        if (result?.prependSystemContext) prependSystemContext += `\n${result.prependSystemContext}`;
        if (result?.appendSystemContext) appendSystemContext += `\n${result.appendSystemContext}`;
      }
    }
  }

  return {
    systemPrompt: systemPrompt.trim() || undefined,
    prependContext: prependContext.trim() || undefined,
    appendContext: appendContext.trim() || undefined,
    prependSystemContext: prependSystemContext.trim() || undefined,
    appendSystemContext: appendSystemContext.trim() || undefined,
  };
}

// ============================================
// HELPERS
// ============================================

export function shouldInjectHeartbeatPrompt(params: {
  trigger?: Trigger;
  isDefaultAgent: boolean;
}): boolean {
  return params.isDefaultAgent && params.trigger === "heartbeat";
}

export function shouldWarnOnOrphanedUserRepair(trigger?: Trigger): boolean {
  return trigger === "user" || trigger === "manual";
}

export function resolvePromptModeForSession(sessionKey?: string): "minimal" | "full" {
  if (!sessionKey) return "full";
  return sessionKey.startsWith("agent:") ? "minimal" : "full";
}

export function resolvePromptSubmissionSkipReason(params: {
  prompt: string;
  messages: unknown[];
  imageCount: number;
}): string | null {
  if (params.prompt.trim() || params.imageCount > 0) return null;
  return params.messages.length > 0 ? "blank_user_prompt" : "empty_prompt_history_images";
}

export function mergeOrphanedTrailingUserPrompt(params: {
  prompt: string;
  leafMessage: { content?: unknown };
}): { prompt: string; merged: boolean; removeLeaf: boolean } {
  const content = params.leafMessage.content;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) return { prompt: params.prompt, merged: false, removeLeaf: true };
  
  return {
    prompt: `[Queued user message]\n${text}\n\n${params.prompt}`,
    merged: true,
    removeLeaf: true,
  };
}