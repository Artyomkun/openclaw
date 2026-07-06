/**
 * Bundled-channel config schemas for OpenClaw-maintained plugins.
 *
 * Third-party plugins should define plugin-local schemas and import primitives
 * from openclaw/plugin-sdk/channel-config-schema instead of depending on these
 * bundled channel schemas.
 */
export {
  AllowFromListSchema,
  buildChannelConfigSchema,
  buildCatchallMultiAccountChannelSchema,
  buildNestedDmConfigSchema,
} from "../channels/plugins/config-schema.ts";
export {
  BlockStreamingCoalesceSchema,
  ContextVisibilityModeSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  ReplyRuntimeConfigSchemaShape,
  requireAllowlistAllowFrom,
  requireOpenAllowFrom,
} from "../config/zod-schema.core.ts";
export { ToolPolicySchema } from "../config/zod-schema.agent-runtime.ts";
export {
  DiscordConfigSchema,
  IMessageConfigSchema,
  MSTeamsConfigSchema,
  SignalConfigSchema,
  SlackConfigSchema,
  TelegramConfigSchema,
} from "../config/zod-schema.providers-core.ts";
export { GoogleChatConfigSchema } from "../config/zod-schema.providers-googlechat.ts";
export { WhatsAppConfigSchema } from "../config/zod-schema.providers-whatsapp.ts";
