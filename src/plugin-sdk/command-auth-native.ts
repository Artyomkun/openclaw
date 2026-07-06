/**
 * Public SDK subpath for native command specs, parsing, and authorization helpers.
 */
export {
  buildCommandTextFromArgs,
  findCommandByNativeName,
  formatCommandArgMenuTitle,
  listChatCommands,
  listNativeCommandSpecs,
  listNativeCommandSpecsForConfig,
  maybeResolveTextAlias,
  normalizeCommandBody,
  parseCommandArgs,
  serializeCommandArgs,
  resolveCommandArgChoices,
  resolveCommandArgMenu,
} from "../auto-reply/commands-registry.ts";
export type {
  ChatCommandDefinition,
  CommandArgDefinition,
  CommandArgValues,
  CommandArgs,
  NativeCommandSpec,
} from "../auto-reply/commands-registry.ts";
export type { CommandArgsParsing } from "../auto-reply/commands-registry.types.ts";
export {
  hasControlCommand,
  shouldComputeCommandAuthorized,
} from "../auto-reply/command-detection.ts";
export {
  resolveCommandAuthorizedFromAuthorizers,
  resolveControlCommandGate,
} from "../channels/command-gating.ts";
export { resolveNativeCommandSessionTargets } from "../channels/native-command-session-targets.ts";
export {
  resolveCommandAuthorization,
  type CommandAuthorization,
} from "../auto-reply/command-auth.ts";
export { resolveStoredModelOverride } from "../auto-reply/reply/stored-model-override.ts";
export {
  formatFastModeCommandOptions,
  formatFastModeCurrentStatus,
  formatFastModeSourceSuffix,
  formatFastModeStatusValue,
  resolveFastModeState,
} from "../agents/fast-mode.ts";
export type { ModelsProviderData } from "../auto-reply/reply/commands-models.ts";
export { listSkillCommandsForAgents } from "../skills/discovery/chat-commands.ts";
export { listProviderPluginCommandSpecs } from "../plugins/command-specs.ts";
