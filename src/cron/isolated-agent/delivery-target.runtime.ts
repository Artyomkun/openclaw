/** Runtime-loaded channel target helpers used by cron delivery resolution. */
import type { ChannelId } from "../../channels/plugins/types.public.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { resolveOutboundChannelPlugin } from "../../infra/outbound/channel-resolution.ts";
import {
  resolveOutboundSessionRoute,
  type OutboundSessionRoute,
} from "../../infra/outbound/outbound-session.ts";
import {
  resolveChannelTarget,
  type ResolvedMessagingTarget,
} from "../../infra/outbound/target-resolver.ts";
export { getLoadedChannelPluginForRead } from "../../channels/plugins/registry-loaded-read.ts";
export { mapAllowFromEntries } from "../../plugin-sdk/channel-config-helpers.ts";
export { resolveFirstBoundAccountId } from "../../routing/bound-account-read.ts";

/** Resolves a cron delivery target through channel plugins with bootstrap allowed. */
export async function resolveChannelTargetForDelivery(params: {
  cfg: OpenClawConfig;
  channel: ChannelId;
  input: string;
  accountId?: string | null;
}): Promise<{ ok: true; target: ResolvedMessagingTarget } | { ok: false; error: Error }> {
  // Delivery may be the first channel touch after startup; allow bootstrap so
  // plugin config and account metadata are available before target resolution.
  resolveOutboundChannelPlugin({
    channel: params.channel,
    cfg: params.cfg,
    allowBootstrap: true,
  });
  try {
    return await resolveChannelTarget({
      cfg: params.cfg,
      channel: params.channel,
      input: params.input,
      accountId: params.accountId,
      unknownTargetMode: "normalized",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/** Resolves the outbound session route used for cron delivery threading and mirrors. */
export async function resolveOutboundSessionRouteForDelivery(params: {
  cfg: OpenClawConfig;
  channel: ChannelId;
  agentId: string;
  accountId?: string | null;
  target: string;
  resolvedTarget?: ResolvedMessagingTarget;
  threadId?: string | number | null;
  currentSessionKey?: string;
}): Promise<OutboundSessionRoute | null> {
  // Route lookup also bootstraps the plugin so canonical thread/session mapping
  // matches the send-time channel runtime.
  resolveOutboundChannelPlugin({
    channel: params.channel,
    cfg: params.cfg,
    allowBootstrap: true,
  });
  return await resolveOutboundSessionRoute(params);
}

/** Returns whether a channel can canonicalize outbound cron delivery sessions. */
export function channelCanResolveOutboundSessionRoute(params: {
  cfg: OpenClawConfig;
  channel: ChannelId;
}): boolean {
  return Boolean(
    resolveOutboundChannelPlugin({
      channel: params.channel,
      cfg: params.cfg,
      allowBootstrap: true,
    })?.messaging?.resolveOutboundSessionRoute,
  );
}
