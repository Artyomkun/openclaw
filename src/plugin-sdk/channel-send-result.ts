// Channel send result contracts normalize outbound delivery outcomes from channel plugins.
import type { ChannelOutboundAdapter } from "../channels/plugins/outbound.types.ts";
import type { ChannelPollResult } from "../channels/plugins/types.public.ts";
import type { OutboundDeliveryResult } from "../infra/outbound/deliver.ts";

export type { ChannelOutboundAdapter } from "../channels/plugins/outbound.types.ts";
export type { OutboundDeliveryResult } from "../infra/outbound/deliver.ts";

/** Attaches the channel id to a single outbound send result. */
export function attachChannelToResult<T extends object>(
  /** Channel id to stamp onto the returned delivery result. */
  channel: string,
  /** Delivery-shaped result without channel metadata. */
  result: T,
) {
  return {
    channel,
    ...result,
  };
}

/** Attaches the channel id to each outbound send result in order. */
export function attachChannelToResults<T extends object>(
  /** Channel id to stamp onto every returned delivery result. */
  channel: string,
  /** Ordered delivery-shaped results without channel metadata. */
  results: readonly T[],
) {
  return results.map((result) => attachChannelToResult(channel, result));
}

/** Creates an empty outbound delivery result for send paths that produced no platform id. */
export function createEmptyChannelResult(
  /** Channel id attached to the synthetic empty result. */
  channel: string,
  /** Additional delivery metadata to preserve alongside the empty message id. */
  result: Partial<Omit<OutboundDeliveryResult, "channel" | "messageId">> & {
    messageId?: string;
  } = {},
): OutboundDeliveryResult {
  // Empty message ids are the older "no platform id" sentinel expected by outbound callers.
  return attachChannelToResult(channel, {
    messageId: "",
    ...result,
  });
}

type MaybePromise<T> = T | Promise<T>;
type SendTextParams = Parameters<NonNullable<ChannelOutboundAdapter["sendText"]>>[0];
type SendMediaParams = Parameters<NonNullable<ChannelOutboundAdapter["sendMedia"]>>[0];
type SendPollParams = Parameters<NonNullable<ChannelOutboundAdapter["sendPoll"]>>[0];

/** Wraps outbound send methods that already return delivery-shaped results without channel ids. */
export function createAttachedChannelResultAdapter(params: {
  /** Channel id attached to every wrapped send result. */
  channel: string;
  /** Text sender that returns an outbound result without channel metadata. */
  sendText?: (ctx: SendTextParams) => MaybePromise<Omit<OutboundDeliveryResult, "channel">>;
  /** Media sender that returns an outbound result without channel metadata. */
  sendMedia?: (ctx: SendMediaParams) => MaybePromise<Omit<OutboundDeliveryResult, "channel">>;
  /** Poll sender that returns a poll result without channel metadata. */
  sendPoll?: (ctx: SendPollParams) => MaybePromise<Omit<ChannelPollResult, "channel">>;
}): Pick<ChannelOutboundAdapter, "sendText" | "sendMedia" | "sendPoll"> {
  return {
    sendText: params.sendText
      ? async (ctx) => attachChannelToResult(params.channel, await params.sendText!(ctx))
      : undefined,
    sendMedia: params.sendMedia
      ? async (ctx) => attachChannelToResult(params.channel, await params.sendMedia!(ctx))
      : undefined,
    sendPoll: params.sendPoll
      ? async (ctx) => attachChannelToResult(params.channel, await params.sendPoll!(ctx))
      : undefined,
  };
}

/** Normalize raw channel send results into the shape shared outbound callers expect. */
export function buildChannelSendResult(
  /** Channel id attached to the normalized delivery result. */
  channel: string,
) {
  return {
    channel
  };
}
