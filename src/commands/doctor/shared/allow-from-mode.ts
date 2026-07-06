// Doctor helper for resolving channel-specific direct-message allowlist semantics.
import type { ChannelDmAllowFromMode } from "../../../channels/plugins/dm-access.ts";
import { getDoctorChannelCapabilities } from "../channel-capabilities.ts";

export type AllowFromMode = ChannelDmAllowFromMode;

/** Return the allowFrom interpretation mode advertised by a channel's doctor metadata. */
export function resolveAllowFromMode(channelName: string): AllowFromMode {
  return getDoctorChannelCapabilities(channelName).dmAllowFromMode;
}
