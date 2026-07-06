// Shared setup wizard/types/helpers for plugin and channel setup surfaces.

export type { OpenClawConfig } from "../config/config.ts";
export type { DmPolicy, GroupPolicy } from "../config/types.ts";
export type { SecretInput } from "../config/types.secrets.ts";
export type {
  WizardMultiSelectParams,
  WizardProgress,
  WizardPrompter,
  WizardSelectParams,
} from "../wizard/prompts.ts";
export { WizardCancelledError } from "../wizard/prompts.ts";
export { createSetupTranslator } from "../wizard/i18n/index.ts";
export type { SetupTranslator, WizardI18nParams } from "../wizard/i18n/index.ts";
export type { ChannelSetupAdapter } from "../channels/plugins/types.adapters.ts";
export type { ChannelSetupInput } from "../channels/plugins/types.core.ts";
export type {
  ChannelSetupDmPolicy,
  ChannelSetupWizardAdapter,
  ChannelSetupWizard,
  ChannelSetupWizardAllowFromEntry,
  ChannelSetupWizardTextInput,
} from "../channels/plugins/setup-wizard-types.ts";

export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.ts";
export { formatCliCommand } from "../cli/command-format.ts";
export { detectBinary } from "../infra/detect-binary.ts";
export { formatDocsLink } from "../../packages/terminal-core/src/links.ts";
export { hasConfiguredSecretInput, normalizeSecretInputString } from "../config/types.secrets.ts";
export { normalizeE164, pathExists } from "../utils.ts";

export {
  moveSingleAccountChannelSectionToDefaultAccount,
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  createEnvPatchedAccountSetupAdapter,
  createSetupInputPresenceValidator,
  createPatchedAccountSetupAdapter,
  createZodSetupInputValidator,
  migrateBaseNameToDefaultAccount,
  patchScopedAccountConfig,
  prepareScopedSetupConfig,
} from "../channels/plugins/setup-helpers.ts";
export {
  addWildcardAllowFrom,
  buildSingleChannelSecretPromptState,
  createAccountScopedAllowFromSection,
  createAccountScopedGroupAccessSection,
  createAllowFromSection,
  createNestedChannelParsedAllowFromPrompt,
  createPromptParsedAllowFromForAccount,
  createStandardChannelSetupStatus,
  createNestedChannelAllowFromSetter,
  createNestedChannelDmPolicy,
  createNestedChannelDmPolicySetter,
  createTopLevelChannelAllowFromSetter,
  createTopLevelChannelDmPolicy,
  createTopLevelChannelDmPolicySetter,
  createTopLevelChannelGroupPolicySetter,
  createTopLevelChannelParsedAllowFromPrompt,
  mergeAllowFromEntries,
  normalizeAllowFromEntries,
  noteChannelLookupFailure,
  noteChannelLookupSummary,
  parseMentionOrPrefixedId,
  parseSetupEntriesAllowingWildcard,
  parseSetupEntriesWithParser,
  patchNestedChannelConfigSection,
  patchTopLevelChannelConfigSection,
  patchChannelConfigForAccount,
  promptAccountId,
  promptParsedAllowFromForAccount,
  promptParsedAllowFromForScopedChannel,
  promptSingleChannelSecretInput,
  promptResolvedAllowFrom,
  resolveParsedAllowFromEntries,
  resolveEntriesWithOptionalToken,
  resolveSetupAccountId,
  resolveGroupAllowlistWithLookupNotes,
  runSingleChannelSecretStep,
  setAccountAllowFromForChannel,
  setAccountDmAllowFromForChannel,
  setAccountGroupPolicyForChannel,
  setChannelDmPolicyWithAllowFrom,
  setNestedChannelAllowFrom,
  setNestedChannelDmPolicyWithAllowFrom,
  setSetupChannelEnabled,
  setTopLevelChannelAllowFrom,
  setTopLevelChannelDmPolicyWithAllowFrom,
  setTopLevelChannelGroupPolicy,
  splitSetupEntries,
} from "../channels/plugins/setup-wizard-helpers.ts";
export { promptChannelAccessConfig } from "../channels/plugins/setup-group-access.ts";
export { createAllowlistSetupWizardProxy } from "../channels/plugins/setup-wizard-proxy.ts";
export {
  createDelegatedFinalize,
  createDelegatedPrepare,
  createDelegatedResolveConfigured,
  createDelegatedSetupWizardProxy,
} from "../channels/plugins/setup-wizard-proxy.ts";
export {
  createCliPathTextInput,
  createDelegatedSetupWizardStatusResolvers,
  createDelegatedTextInputShouldPrompt,
  createDetectedBinaryStatus,
} from "../channels/plugins/setup-wizard-binary.ts";

export { formatResolvedUnresolvedNote } from "./resolution-notes.ts";
