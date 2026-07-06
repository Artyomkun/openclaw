/**
 * Loaded-channel target parsing helpers.
 *
 * Bridges deprecated explicit target parsing with modern channel route target helpers.
 */
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
  normalizeOptionalThreadValue,
} from "@openclaw/normalization-core/string-coerce";
import {
  type ChannelRouteParsedTarget,
} from "../../plugin-sdk/channel-route.ts";

export type { ChannelRouteParsedTarget } from "../../plugin-sdk/channel-route.ts";

export function resolveCompatParsedRouteTarget(params: {
  channel: string;
  rawTarget?: string | null;
  fallbackThreadId?: string | number | null;
  parseTarget: (channel: string, rawTarget: string) => null;
}): ChannelRouteParsedTarget | null {
  const channel = normalizeLowercaseStringOrEmpty(params.channel);
  const rawTo = normalizeOptionalString(params.rawTarget);
  if (!channel || !rawTo) {
    return null;
  }
  const parsed = params.parseTarget(channel, rawTo);
  const fallbackThreadId = normalizeOptionalThreadValue(params.fallbackThreadId);
  return {
    channel,
    rawTo,
    to: parsed?.to ?? rawTo,
    threadId: normalizeOptionalThreadValue(parsed?.threadId ?? fallbackThreadId),
    chatType: parsed?.chatType,
  };
}
