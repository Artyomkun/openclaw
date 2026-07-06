/**
 * Shared inbound reply dispatch helpers for channel message adapters and
 * deprecated SDK compatibility facades.
 */

import { withReplyDispatcher } from "../../auto-reply/dispatch.ts";
import type { GetReplyOptions } from "../../auto-reply/get-reply-options.types.ts";
import {
  dispatchReplyFromConfig,
  type DispatchFromConfigResult,
} from "../../auto-reply/reply/dispatch-from-config.ts";
import type { DispatchReplyWithBufferedBlockDispatcher } from "../../auto-reply/reply/provider-dispatcher.types.ts";
import type { ReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.types.ts";
import type { FinalizedMsgContext } from "../../auto-reply/templating.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import {
  hasFinalChannelTurnDispatch,
  hasVisibleChannelTurnDispatch,
  deliverInboundReplyWithMessageSendContext,
  dispatchChannelInboundReply as dispatchChannelInboundReplyCore,
  resolveChannelTurnDispatchCounts,
  recordDroppedChannelInboundHistory,
  runChannelInboundEvent as runChannelInboundEventCore,
  runPreparedInboundReply as runPreparedInboundReplyCore,
} from "../turn/kernel.ts";
import type {
  ChannelTurnResult,
} from "../turn/kernel.ts";
import type {
  AssembledChannelTurn,
  PreparedChannelTurn,
  RunChannelTurnParams,
} from "../turn/types.ts";

export type {
  ChannelTurnDroppedHistoryOptions,
  ChannelTurnDroppedHistoryOptions as ChannelInboundDroppedHistoryOptions,
  ChannelTurnRecordOptions,
  ChannelTurnRecordOptions as InboundReplyRecordOptions,
} from "../turn/types.ts";
export type { DurableInboundReplyDeliveryParams } from "../turn/kernel.ts";
export type { ChannelBotLoopProtectionFacts } from "../turn/kernel.ts";
export { recordChannelBotPairLoopAndCheckSuppression } from "../turn/kernel.ts";

type RecordInboundSessionFn = typeof import("../session.js").recordInboundSession;

type ReplyDispatchFromConfigOptions = Omit<GetReplyOptions, "onBlockReply">;
export type ChannelInboundEventRunnerParams<
  TRaw,
  TDispatchResult = DispatchFromConfigResult,
> = RunChannelTurnParams<TRaw, TDispatchResult>;
export type PreparedInboundReply<TDispatchResult> = PreparedChannelTurn<TDispatchResult>;
export type AssembledInboundReply = AssembledChannelTurn;
export type InboundReplyDispatchResult<TDispatchResult> = ChannelTurnResult<TDispatchResult>;

export async function runPreparedInboundReply<TDispatchResult>(
  params: PreparedChannelTurn<TDispatchResult>,
): Promise<ChannelTurnResult<TDispatchResult>> {
  return await runPreparedInboundReplyCore(params);
}

export async function runChannelInboundEvent<TRaw, TDispatchResult = DispatchFromConfigResult>(
  params: ChannelInboundEventRunnerParams<TRaw, TDispatchResult>,
) {
  return await runChannelInboundEventCore(params);
}

export async function dispatchChannelInboundReply(params: AssembledInboundReply) {
  return await dispatchChannelInboundReplyCore(params);
}

export {
  hasFinalChannelTurnDispatch as hasFinalInboundReplyDispatch,
  hasVisibleChannelTurnDispatch as hasVisibleInboundReplyDispatch,
  deliverInboundReplyWithMessageSendContext as deliverDurableInboundReplyPayload,
  deliverInboundReplyWithMessageSendContext,
  recordDroppedChannelInboundHistory as recordDroppedChannelTurnHistory,
  recordDroppedChannelInboundHistory,
  resolveChannelTurnDispatchCounts as resolveInboundReplyDispatchCounts,
};

/** Run `dispatchReplyFromConfig` with a dispatcher that always gets its settled callback. */
export async function dispatchReplyFromConfigWithSettledDispatcher(params: {
  cfg: OpenClawConfig;
  ctxPayload: FinalizedMsgContext;
  dispatcher: ReplyDispatcher;
  onSettled: () => void | Promise<void>;
  replyOptions?: ReplyDispatchFromConfigOptions;
  configOverride?: OpenClawConfig;
}): Promise<DispatchFromConfigResult> {
  return await withReplyDispatcher({
    dispatcher: params.dispatcher,
    onSettled: params.onSettled,
    run: () =>
      dispatchReplyFromConfig({
        ctx: params.ctxPayload,
        cfg: params.cfg,
        dispatcher: params.dispatcher,
        replyOptions: params.replyOptions,
        configOverride: params.configOverride,
      }),
  });
}

/** Assemble the common inbound reply dispatch dependencies for a resolved route. */
export function buildInboundReplyDispatchBase(params: {
  cfg: OpenClawConfig;
  channel: string;
  accountId?: string;
  route: {
    agentId: string;
    sessionKey: string;
  };
  storePath: string;
  ctxPayload: FinalizedMsgContext;
  core: {
    channel: {
      session: {
        recordInboundSession: RecordInboundSessionFn;
      };
      reply: {
        dispatchReplyWithBufferedBlockDispatcher: DispatchReplyWithBufferedBlockDispatcher;
      };
    };
  };
}) {
  return {
    cfg: params.cfg,
    channel: params.channel,
    accountId: params.accountId,
    agentId: params.route.agentId,
    routeSessionKey: params.route.sessionKey,
    storePath: params.storePath,
    ctxPayload: params.ctxPayload,
    recordInboundSession: params.core.channel.session.recordInboundSession,
    dispatchReplyWithBufferedBlockDispatcher:
      params.core.channel.reply.dispatchReplyWithBufferedBlockDispatcher,
  };
}
