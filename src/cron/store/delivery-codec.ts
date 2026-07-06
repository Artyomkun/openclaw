import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const CronDeliverySchema = z.object({
  mode: z.enum(["none", "announce", "webhook"]).optional(),
  channel: z.string().optional(),
  to: z.string().optional(),
  threadId: z.string().optional(),
  accountId: z.string().optional(),
  bestEffort: z.boolean().optional(),
  completionDestination: z.object({
    mode: z.enum(["webhook"]),
    to: z.string().optional(),
  }).optional(),
  failureDestination: z.object({
    mode: z.enum(["announce", "webhook"]).optional(),
    channel: z.string().optional(),
    to: z.string().optional(),
    accountId: z.string().optional(),
  }).optional(),
});

type CronDelivery = z.infer<typeof CronDeliverySchema>;

// ============================================
// MAIN
// ============================================

export function deliveryToJson(delivery: CronDelivery | undefined): string | null {
  if (!delivery) return null;
  return JSON.stringify(delivery);
}

export function deliveryFromJson(json: string | null): CronDelivery | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    return CronDeliverySchema.parse(parsed);
  } catch {
    return undefined;
  }
}