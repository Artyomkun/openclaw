/**
 * Runtime SDK subpath for channel setup wizards, prompts, and allowlist helpers.
 */
export type { OpenClawConfig } from "../config/config.ts";
export type { WizardPrompter } from "../wizard/prompts.ts";
export { createClackPrompter } from "../wizard/clack-prompter.ts";
export { createSetupTranslator } from "../wizard/i18n/index.ts";
export type { SetupTranslator, WizardI18nParams } from "../wizard/i18n/index.ts";
export type { ChannelSetupAdapter } from "../channels/plugins/types.adapters.ts";
export type {
  ChannelSetupDmPolicy,
  ChannelSetupWizard,
  ChannelSetupWizardAllowFromEntry,
  ChannelSetupWizardTextInput,
} from "../channels/plugins/setup-wizard-types.ts";

export { DEFAULT_ACCOUNT_ID } from "../routing/session-key.ts";

export {
  createEnvPatchedAccountSetupAdapter,
  createPatchedAccountSetupAdapter,
  createSetupInputPresenceValidator,
} from "../channels/plugins/setup-helpers.ts";

export {
  createAccountScopedAllowFromSection,
  createAccountScopedGroupAccessSection,
  createTopLevelChannelDmPolicy,
  createStandardChannelSetupStatus,
  mergeAllowFromEntries,
  noteChannelLookupFailure,
  noteChannelLookupSummary,
  parseSetupEntriesAllowingWildcard,
  parseMentionOrPrefixedId,
  patchChannelConfigForAccount,
  promptResolvedAllowFrom,
  promptParsedAllowFromForAccount,
  resolveEntriesWithOptionalToken,
  resolveSetupAccountId,
  setAccountAllowFromForChannel,
  setSetupChannelEnabled,
  splitSetupEntries,
} from "../channels/plugins/setup-wizard-helpers.ts";

export { createAllowlistSetupWizardProxy } from "../channels/plugins/setup-wizard-proxy.ts";
export {
  createCliPathTextInput,
  createDelegatedTextInputShouldPrompt,
} from "../channels/plugins/setup-wizard-binary.ts";
export { createDelegatedSetupWizardProxy } from "../channels/plugins/setup-wizard-proxy.ts";
