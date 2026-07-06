// Runtime channel-plugin entrypoint for registry and config matching helpers.
// Keep plugin-facing type exports narrow; broader SDK barrels live elsewhere.
export {
  getChannelPlugin,
  getLoadedChannelPlugin,
  getLoadedChannelPluginOrigin,
  listChannelPlugins,
  normalizeChannelId,
} from "./registry.ts";
export {
  applyChannelMatchMeta,
  buildChannelKeyCandidates,
  normalizeChannelSlug,
  resolveChannelEntryMatch,
  resolveChannelEntryMatchWithFallback,
  resolveChannelMatchConfig,
  resolveNestedAllowlistDecision,
  type ChannelEntryMatch,
  type ChannelMatchSource,
} from "./channel-config.ts";
export {
  formatAllowlistMatchMeta,
  type AllowlistMatch,
  type AllowlistMatchSource,
} from "../allowlist-match.ts";
export type { ChannelId } from "./types.public.ts";
export type { ChannelPlugin } from "./types.plugin.ts";
export { resolveChannelApprovalAdapter, resolveChannelApprovalCapability } from "./approvals.ts";
