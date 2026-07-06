/**
 * Subagent announcement origin resolver.
 *
 * Merges requester and session delivery context while avoiding stale thread ids after retargeting.
 */
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { getLoadedChannelPluginForRead } from "../channels/plugins/registry-loaded-read.ts";
import type { ChannelId } from "../channels/plugins/types.public.ts";
import {
  stripTargetKindPrefix,
  stripTargetProviderPrefix,
  stripTargetTopicSuffix,
} from "../infra/outbound/channel-target-prefix.ts";
import {
  deliveryContextFromSession,
  mergeDeliveryContext,
  normalizeDeliveryContext,
} from "../utils/delivery-context.shared.ts";
import type {
  DeliveryContext,
  DeliveryContextSessionSource,
} from "../utils/delivery-context.types.ts";
import { isInternalMessageChannel } from "../utils/message-channel.ts";
export type { DeliveryContext } from "../utils/delivery-context.types.ts";

function normalizeAnnounceRouteTarget(context?: DeliveryContext): string | undefined {
  const rawTo = normalizeOptionalString(context?.to);
  if (!rawTo) {
    return undefined;
  }
  const channel = normalizeOptionalString(context?.channel);
  const messaging = channel
    ? getLoadedChannelPluginForRead(channel as ChannelId)?.messaging
    : undefined;
  const route = stripTargetTopicSuffix(
    stripTargetKindPrefix(stripTargetProviderPrefix(rawTo, channel ?? ""), ["group", "channel"]),
  );
  const normalized = messaging?.normalizeTarget?.(route) ?? route;
  return normalized || undefined;
}

function shouldStripThreadFromAnnounceEntry(
  normalizedRequester?: DeliveryContext,
  normalizedEntry?: DeliveryContext,
): boolean {
  if (
    !normalizedRequester?.to ||
    normalizedRequester.threadId != null ||
    normalizedEntry?.threadId == null
  ) {
    return false;
  }
  const requesterTarget = normalizeAnnounceRouteTarget(normalizedRequester);
  const entryTarget = normalizeAnnounceRouteTarget(normalizedEntry);
  if (requesterTarget && entryTarget) {
    return requesterTarget !== entryTarget;
  }
  return false;
}

/** Resolve the delivery origin for a subagent completion announcement. */
export function resolveAnnounceOrigin(
  entry?: DeliveryContextSessionSource,
  requesterOrigin?: DeliveryContext,
): DeliveryContext | undefined {
  const normalizedRequester = normalizeDeliveryContext(requesterOrigin);
  const normalizedEntry = deliveryContextFromSession(entry);
  if (normalizedRequester?.channel && isInternalMessageChannel(normalizedRequester.channel)) {
    return mergeDeliveryContext(
      {
        accountId: normalizedRequester.accountId,
        threadId: normalizedRequester.threadId,
      },
      normalizedEntry,
    );
  }
  const entryForMerge =
    normalizedEntry && shouldStripThreadFromAnnounceEntry(normalizedRequester, normalizedEntry)
      ? (() => {
          // A stored thread only applies to the same normalized route target.
          const { threadId: _ignore, ...rest } = normalizedEntry;
          return rest;
        })()
      : normalizedEntry;
  return mergeDeliveryContext(normalizedRequester, entryForMerge);
}
