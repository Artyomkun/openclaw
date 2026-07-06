/**
 * Public channel plugin type barrel.
 *
 * Re-exports stable plugin-facing channel types and message action names.
 */
import type { ChannelMessageActionName as ChannelMessageActionNameFromList } from "./message-action-names.ts";

export { CHANNEL_MESSAGE_ACTION_NAMES } from "./message-action-names.ts";
export type * from "./types.core.ts";
export type * from "./types.adapters.ts";
export type { ChannelMessageCapability } from "./message-capabilities.ts";
export type { ChannelPlugin } from "./types.plugin.ts";

/** Stable message action name union derived from the registered action list. */
export type ChannelMessageActionName = ChannelMessageActionNameFromList;
