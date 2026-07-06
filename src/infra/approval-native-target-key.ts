// Builds dedupe keys for channel-native approval targets.
import type { ChannelApprovalNativeTarget } from "../channels/plugins/approval-native.types.ts";
import { channelRouteDedupeKey } from "../plugin-sdk/channel-route.ts";

/** Builds the stable dedupe key used to compare channel-native approval targets. */
export function buildChannelApprovalNativeTargetKey(target: ChannelApprovalNativeTarget): string {
  return channelRouteDedupeKey({
    to: target.to,
    threadId: target.threadId,
  });
}
