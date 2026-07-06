/** Builds normalized command context from inbound message and authorization state. */
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "@openclaw/normalization-core/string-coerce";
import { normalizeAnyChannelId } from "../../channels/registry.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { resolveCommandAuthorization } from "../command-auth.ts";
import { normalizeCommandBody } from "../commands-registry-normalize.ts";
import type { MsgContext } from "../templating.ts";
import type { CommandContext } from "./commands-types.ts";
import { stripMentions } from "./mentions.ts";

/** Builds command routing/auth metadata consumed by command handlers. */
export function buildCommandContext(params: {
  ctx: MsgContext;
  cfg: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  isGroup: boolean;
  triggerBodyNormalized: string;
  commandAuthorized: boolean;
}): CommandContext {
  const { ctx, cfg, agentId, sessionKey, isGroup, triggerBodyNormalized } = params;
  const auth = resolveCommandAuthorization({
    ctx,
    cfg,
    commandAuthorized: params.commandAuthorized,
  });
  const surface = normalizeLowercaseStringOrEmpty(ctx.Surface ?? ctx.Provider);
  const channel = normalizeLowercaseStringOrEmpty(
    ctx.OriginatingChannel ?? ctx.Provider ?? surface,
  );
  const from = auth.from ?? normalizeOptionalString(ctx.SenderId);
  const to = auth.to ?? normalizeOptionalString(ctx.OriginatingTo);
  const abortKey = sessionKey ?? from ?? to;
  const channelId =
    normalizeAnyChannelId(channel) ??
    (channel ? (channel as CommandContext["channelId"]) : undefined);
  const rawBodyNormalized = triggerBodyNormalized;
  const commandBodyNormalized = normalizeCommandBody(
    isGroup ? stripMentions(rawBodyNormalized, ctx, cfg, agentId) : rawBodyNormalized,
    { botUsername: ctx.BotUsername },
  );

  return {
    surface,
    channel,
    channelId: channelId ?? auth.providerId,
    accountId: normalizeOptionalString(ctx.AccountId),
    ownerList: auth.ownerList,
    senderIsOwner: auth.senderIsOwner,
    isAuthorizedSender: auth.isAuthorizedSender,
    senderId: auth.senderId,
    abortKey,
    rawBodyNormalized,
    commandBodyNormalized,
    from,
    to,
  };
}
