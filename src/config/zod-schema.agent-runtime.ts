import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  workspace: z.string().optional(),
  model: z.string().optional(),
  thinkingDefault: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "adaptive", "max"]).optional(),
  reasoningDefault: z.enum(["on", "off", "stream"]).optional(),
  tools: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    exec: z.object({
      enabled: z.boolean().optional(),
      workspaceOnly: z.boolean().optional(),
    }).optional(),
    fs: z.object({
      workspaceOnly: z.boolean().optional(),
    }).optional(),
  }).optional(),
  sandbox: z.object({
    mode: z.enum(["off", "non-main", "all"]).optional(),
    workspaceAccess: z.enum(["none", "ro", "rw"]).optional(),
    docker: z.object({
      image: z.string().optional(),
      network: z.string().optional(),
      binds: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
  heartbeat: z.object({
    every: z.string().optional(),
    prompt: z.string().optional(),
  }).optional(),
  contextLimits: z.object({
    toolResultMaxChars: z.number().int().min(1).max(1_000_000).optional(),
  }).optional(),
  runRetries: z.object({
    base: z.number().int().positive().optional(),
    max: z.number().int().positive().optional(),
  }).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;