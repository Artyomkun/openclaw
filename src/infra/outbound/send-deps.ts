/**
 * Dynamic bag of per-channel send functions, keyed by channel ID.
 * Each outbound adapter resolves its own function from this record and
 * falls back to a direct import when the key is absent.
 */
export type OutboundSendDeps = { [channelId: string]: unknown };

/**
 * Resolves a channel send dependency by channel ID.
 */
export function resolveOutboundSendDep(
  deps: OutboundSendDeps | null | undefined,
  channelId: string
): unknown {
  return deps?.[channelId];
}
