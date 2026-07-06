import { z } from "zod";
import { createClient, RedisClientType } from "redis";
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";

// ============================================
// SCHEMAS
// ============================================

const CacheRetentionSchema = z.enum(["none", "short", "long"]);
type CacheRetention = z.infer<typeof CacheRetentionSchema>;

// ============================================
// REDIS CLIENT
// ============================================

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
    });
    await redisClient.connect();
  }
  return redisClient;
}

// ============================================
// MAIN
// ============================================

export async function resolveCacheRetention(
  extraParams: Record<string, unknown> | undefined,
  provider: string,
  modelApi?: string,
  modelId?: string,
  supportsPromptCacheKey?: boolean,
): Promise<CacheRetention | undefined> {
  const explicit = extraParams?.cacheRetention;
  if (explicit === "none" || explicit === "short" || explicit === "long") {
    return explicit;
  }

  try {
    const redis = await getRedisClient();
    const cacheKey = `prompt:cache:${provider}:${modelApi || "default"}:${modelId || "default"}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const { retention, ttl } = JSON.parse(cached);
      if (ttl > Date.now()) {
        return retention;
      }
    }
  } catch (error) {
    console.error("Redis cache check failed:", error);
  }

  if (modelApi === "google-generative-ai") {
    const normalizedId = normalizeLowercaseStringOrEmpty(modelId);
    if (normalizedId.startsWith("gemini-2.5") || normalizedId.startsWith("gemini-3")) {
      return "long";
    }
  }

  if (provider === "anthropic") {
    return "short";
  }

  if (supportsPromptCacheKey === true) {
    return "short";
  }

  return undefined;
}

// ============================================
// SET CACHE
// ============================================

export async function setCacheRetention(
  provider: string,
  modelApi: string | undefined,
  modelId: string | undefined,
  retention: CacheRetention,
  ttlSeconds: number = 3600,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    const cacheKey = `prompt:cache:${provider}:${modelApi || "default"}:${modelId || "default"}`;
    await redis.setEx(cacheKey, ttlSeconds, JSON.stringify({
      retention,
      ttl: Date.now() + ttlSeconds * 1000,
    }));
  } catch (error) {
    console.error("Failed to set cache retention:", error);
  }
}