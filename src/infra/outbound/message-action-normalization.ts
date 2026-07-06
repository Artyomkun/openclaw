// Normalizes message-action input by inferring channel/target context.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type {
  ChannelMessageActionName,
  ChannelThreadingToolContext,
} from "../../channels/plugins/types.public.ts";
import {
  isDeliverableMessageChannel,
  normalizeMessageChannel,
} from "../../utils/message-channel.ts";
import { applyTargetToParams } from "./channel-target.ts";

/** Normalizes message-action args before target validation and dispatch. */
export function normalizeMessageActionInput(params: {
  action: ChannelMessageActionName;
  args: Record<string, unknown>;
  toolContext?: ChannelThreadingToolContext;
}): Record<string, unknown> {
  const { action, toolContext } = params;
  const args = { ...params.args };

  // Resolve channel
  const channel =
    normalizeOptionalString(args.channel) ??
    normalizeMessageChannel(toolContext?.currentChannelProvider) ??
    "";
  if (channel && isDeliverableMessageChannel(channel)) {
    args.channel = channel;
  }
  const target =
    normalizeOptionalString(args.target) ??
    normalizeOptionalString(toolContext?.currentChannelId) ??
    normalizeOptionalString(toolContext?.currentMessagingTarget) ??
    "";
  if (target) {
    args.target = target;
    delete args.to;
    delete args.channelId;
  }

  applyTargetToParams({ action, args });
  return args;
}