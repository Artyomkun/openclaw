// Normalizes channel config compatibility fields during config loading.
import {
  type CompatMutationResult,
} from "../channels/plugins/dm-access.ts";
export type { CompatMutationResult };


/** Narrows unknown config JSON values to mutable object records. */
export function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}