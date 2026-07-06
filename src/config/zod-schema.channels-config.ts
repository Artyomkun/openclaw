import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

export const ChannelBotLoopProtectionSchema = z.object({
  enabled: z.boolean().optional(),
  maxEventsPerWindow: z.number().int().positive().optional(),
  windowSeconds: z.number().int().positive().optional(),
  cooldownSeconds: z.number().int().positive().optional(),
}).strict();

export const ChannelConfigSchema = z.object({
  defaults: z.object({
    groupPolicy: z.enum(["allow", "deny", "inherit"]).optional(),
    contextVisibility: z.enum(["public", "private", "shared"]).optional(),
    heartbeat: z.object({
      enabled: z.boolean().optional(),
      visibility: z.enum(["public", "private"]).optional(),
    }).optional(),
    botLoopProtection: ChannelBotLoopProtectionSchema.optional(),
  }).strict().optional(),
  modelByChannel: z.record(z.string(), z.record(z.string(), z.string())).optional(),
}).strict();

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;