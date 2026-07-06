// Slack plugin module implements streaming compat behavior.
import {
  getChannelStreamingConfigObject,
  resolveChannelStreamingNativeTransport,
} from "openclaw/plugin-sdk/channel-outbound";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "openclaw/plugin-sdk/string-coerce-runtime";

export type StreamingMode = "off" | "partial" | "block" | "progress";

function normalizeStreamingMode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized =
    normalizeOptionalString(value) == null ? "" : normalizeLowercaseStringOrEmpty(value);
  return normalized || null;
}

function parseStreamingMode(value: unknown): StreamingMode | null {
  const normalized = normalizeStreamingMode(value);
  if (
    normalized === "off" ||
    normalized === "partial" ||
    normalized === "block" ||
    normalized === "progress"
  ) {
    return normalized;
  }
  return null;
}

export function resolveSlackStreamingMode(
  params: {
    streamMode?: unknown;
    streaming?: unknown;
  } = {},
): StreamingMode {
  const parsedStreaming = parseStreamingMode(
    getChannelStreamingConfigObject(params)?.mode ?? params.streaming,
  );
  if (parsedStreaming) {
    return parsedStreaming;
  }
  if (typeof params.streaming === "boolean") {
    return params.streaming ? "partial" : "off";
  }
  return "partial";
}

export function resolveSlackNativeStreaming(
  params: {
    nativeStreaming?: unknown;
    streaming?: unknown;
  } = {},
): boolean {
  const canonical = resolveChannelStreamingNativeTransport(params);
  if (typeof canonical === "boolean") {
    return canonical;
  }
  if (typeof params.streaming === "boolean") {
    return params.streaming;
  }
  return true;
}
