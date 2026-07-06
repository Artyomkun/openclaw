// Delivery-result adapters for channel turn receipts.
import { listMessageReceiptPlatformIds } from "../message/receipt.ts";
import type { MessageReceipt } from "../message/types.ts";
import type { ChannelDeliveryIntent, ChannelDeliveryResult } from "./types.ts";

/** Converts a normalized message receipt into the delivery result shape used by channel turns. */
export function createChannelDeliveryResultFromReceipt(params: {
  receipt: MessageReceipt;
  threadId?: string;
  replyToId?: string;
  visibleReplySent?: boolean;
  deliveryIntent?: ChannelDeliveryIntent;
}): ChannelDeliveryResult {
  const messageIds = listMessageReceiptPlatformIds(params.receipt);
  return {
    ...(messageIds.length > 0 ? { messageIds } : {}),
    receipt: params.receipt,
    ...(params.threadId ? { threadId: params.threadId } : {}),
    ...(params.replyToId ? { replyToId: params.replyToId } : {}),
    ...(params.visibleReplySent === undefined ? {} : { visibleReplySent: params.visibleReplySent }),
    ...(params.deliveryIntent ? { deliveryIntent: params.deliveryIntent } : {}),
  };
}
