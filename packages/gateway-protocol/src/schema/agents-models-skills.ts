/**
 * Gateway - API Schemas
 */

import { z } from "zod";

// Агент
export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  workspace: z.string().optional(),
});

export const ModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
});