/**
 * Gateway - Cron Schemas
 */

import { z } from "zod";

export const ScheduleSchema = z.union([
  z.object({ kind: z.literal("at"), at: z.string() }),
  z.object({ kind: z.literal("every"), everyMs: z.number().positive() }),
  z.object({ kind: z.literal("cron"), expr: z.string() }),
]);

export const CronJobSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  schedule: ScheduleSchema,
  payload: z.object({
    message: z.string(),
    model: z.string().optional(),
  }),
  delivery: z.object({
    channel: z.string().optional(),
    to: z.string().optional(),
  }).optional(),
  state: z.object({
    lastRunAt: z.number().optional(),
    lastStatus: z.string().optional(),
    lastError: z.string().optional(),
  }).optional(),
});