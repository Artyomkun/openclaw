// Canonical shared prelude for channel-oriented plugin SDK surfaces.
// Keep `core` and channel-specific SDK entrypoints derived from this module
// so bundled channel entrypoints do not drift across overlapping exports.
export type { ChannelPlugin } from "../channels/plugins/types.plugin.ts";
export type { ChannelMessageActionContext } from "../channels/plugins/types.public.ts";
export type { PluginRuntime } from "../plugins/runtime/types.ts";
export type { OpenClawPluginApi } from "../plugins/types.ts";

export { emptyPluginConfigSchema } from "../plugins/config-schema.ts";

export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.ts";

export {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../channels/plugins/setup-helpers.ts";
export { buildChannelConfigSchema } from "../channels/plugins/config-schema.ts";
export {
  clearAccountEntryFields,
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "../channels/plugins/config-helpers.ts";
export { formatPairingApproveHint } from "../channels/plugins/helpers.ts";
export { PAIRING_APPROVED_MESSAGE } from "../channels/plugins/pairing-message.ts";

export { getChatChannelMeta } from "../channels/chat-meta.ts";
