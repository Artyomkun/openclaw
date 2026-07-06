import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

export const ConfigSchema = z.object({
  agents: z.object({
    list: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
      model: z.string().optional(),
      workspace: z.string().optional(),
    })).optional(),
  }).optional(),

  tools: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    exec: z.object({
      enabled: z.boolean().optional(),
      workspaceOnly: z.boolean().optional(),
    }).optional(),
  }).optional(),

  models: z.object({
    providers: z.record(z.string(), z.object({
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      models: z.array(z.object({
        id: z.string(),
        name: z.string(),
      })).optional(),
    })).optional(),
  }).optional(),

  channels: z.object({
    defaults: z.object({
      groupPolicy: z.enum(["open", "disabled", "allowlist"]).optional(),
    }).optional(),
  }).optional(),

  logging: z.object({
    level: z.enum(["silent", "error", "warn", "info", "debug", "trace"]).optional(),
  }).optional(),

  gateway: z.object({
    port: z.number().int().positive().optional(),
    bind: z.enum(["auto", "lan", "loopback", "custom", "tailnet"]).optional(),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;