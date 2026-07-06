/**
 * ACP - Meta Helpers
 */

export function readString(meta: any, keys: string[]): string | undefined {
  for (const key of keys) {
    if (meta?.[key] && typeof meta[key] === "string") return meta[key];
  }
}

export function readBool(meta: any, keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof meta?.[key] === "boolean") return meta[key];
  }
}

export function readNumber(meta: any, keys: string[]): number | undefined {
  for (const key of keys) {
    if (typeof meta?.[key] === "number" && Number.isFinite(meta[key])) return meta[key];
  }
}