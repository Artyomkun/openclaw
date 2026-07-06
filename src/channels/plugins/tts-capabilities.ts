/**
 * Channel TTS voice capability resolver.
 *
 * Reads channel-advertised voice delivery support for prompt and runtime routing.
 */
import { normalizeChannelId } from "./registry.ts";
import { getChannelPlugin } from "./registry.ts";
import type { ChannelTtsVoiceDeliveryCapabilities } from "./types.core.ts";

export function resolveChannelTtsVoiceDelivery(
  channel: string | undefined,
): ChannelTtsVoiceDeliveryCapabilities | undefined {
  const channelId = normalizeChannelId(channel);
  if (!channelId) {
    return undefined;
  }
  return getChannelPlugin(channelId)?.capabilities.tts?.voice;
}
