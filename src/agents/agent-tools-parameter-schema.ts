import { z } from "zod";
import type { TSchema } from "typebox";

const OptionsSchema = z.object({
  provider: z.string().optional(),
  id: z.string().optional(),
  compat: z.object({
    toolSchemaProfile: z.string().optional(),
    unsupportedKeywords: z.array(z.string()).optional(),
    omitEmptyArrayItems: z.boolean().optional(),
  }).optional(),
});

type Options = z.infer<typeof OptionsSchema>;

const cache = new WeakMap<object, Map<string, TSchema>>();

function getKey(opts?: Options): string {
  const c = opts?.compat ?? {};
  return JSON.stringify([
    opts?.provider ?? "",
    opts?.id ?? "",
    c.toolSchemaProfile ?? "",
    c.unsupportedKeywords ?? [],
    c.omitEmptyArrayItems ?? false,
  ]);
}

function clean(schema: unknown, opts?: Options): TSchema {
  let result = schema;
  const validated = opts ? OptionsSchema.parse(opts) : undefined;
  const unsupported = validated?.compat?.unsupportedKeywords ?? [];
  if (unsupported.length && typeof result === "object" && result !== null) {
    const copy = { ...(result as Record<string, unknown>) };
    for (const kw of unsupported) delete copy[kw];
    result = copy;
  }
  if (validated?.provider?.includes("gemini")) {
    if (typeof result === "object" && result !== null) {
      const copy = { ...(result as Record<string, unknown>) };
      delete copy.additionalProperties;
      delete copy.patternProperties;
      delete copy.default;
      result = copy;
    }
  }
  
  return result as TSchema;
}

export function normalizeToolParameterSchema(schema: unknown, opts?: Options): TSchema {
  if (!schema || typeof schema !== "object") return schema as TSchema;
  
  const key = getKey(opts);
  let map = cache.get(schema as object);
  if (map?.has(key)) return map.get(key)!;
  
  const result = clean(schema, opts);
  
  if (!map) {
    map = new Map();
    cache.set(schema as object, map);
  }
  map.set(key, result);
  return result;
}