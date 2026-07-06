// Slack plugin module implements setup surface behavior.
import {
  noteChannelLookupFailure,
  noteChannelLookupSummary,
  resolveEntriesWithOptionalToken,
  createSetupTranslator,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/setup-runtime";
import type {
  ChannelSetupWizard,
  ChannelSetupWizardAllowFromEntry,
} from "openclaw/plugin-sdk/setup-runtime";
import { normalizeStringEntries } from "openclaw/plugin-sdk/string-coerce-runtime";
import { resolveSlackChannelAllowlist } from "./resolve-channels.js";
import { resolveSlackUserAllowlist } from "./resolve-users.js";
import { createSlackSetupWizardBase } from "./setup-core.js";

const t = createSetupTranslator();

async function resolveSlackAllowFromEntries(params: {
  token?: string;
  entries: string[];
}): Promise<ChannelSetupWizardAllowFromEntry[]> {
  return await resolveEntriesWithOptionalToken({
    token: params.token,
    entries: params.entries,
    buildWithoutToken: (input) => ({
      input,
      resolved: false,
      id: null,
    }),
    resolveEntries: async ({ token, entries }) =>
      (
        await resolveSlackUserAllowlist({
          token,
          entries,
        })
      ).map((entry) => ({
        input: entry.input,
        resolved: entry.resolved,
        id: entry.id ?? null,
      })),
  });
}

async function resolveSlackGroupAllowlist(params: {
  cfg: OpenClawConfig;
  accountId: string;
  credentialValues: { botToken?: string };
  entries: string[];
  prompter: { note: (message: string, title?: string) => Promise<void> };
}) {
  let keys = params.entries;
  const activeBotToken = params.credentialValues.botToken || "";
  if (params.entries.length > 0) {
    try {
      const resolved = await resolveEntriesWithOptionalToken<{
        input: string;
        resolved: boolean;
        id?: string;
      }>({
        token: activeBotToken,
        entries: params.entries,
        buildWithoutToken: (input) => ({ input, resolved: false, id: undefined }),
        resolveEntries: async ({ token, entries }) =>
          await resolveSlackChannelAllowlist({
            token,
            entries,
          }),
      });
      const resolvedKeys = resolved
        .filter((entry) => entry.resolved && entry.id)
        .map((entry) => entry.id as string);
      const unresolved = resolved.filter((entry) => !entry.resolved).map((entry) => entry.input);
      keys = [...resolvedKeys, ...normalizeStringEntries(unresolved)];
      await noteChannelLookupSummary({
        prompter: params.prompter,
        label: t("wizard.slack.channelsLabel"),
        resolvedSections: [{ title: t("wizard.channels.resolvedTitle"), values: resolvedKeys }],
        unresolved,
      });
    } catch (error) {
      await noteChannelLookupFailure({
        prompter: params.prompter,
        label: t("wizard.slack.channelsLabel"),
        error,
      });
    }
  }
  return keys;
}

export const slackSetupWizard: ChannelSetupWizard = createSlackSetupWizardBase({
  resolveAllowFromEntries: async ({ credentialValues, entries }) =>
    await resolveSlackAllowFromEntries({
      token: credentialValues.botToken,
      entries,
    }),
  resolveGroupAllowlist: async ({ cfg, accountId, credentialValues, entries, prompter }) =>
    await resolveSlackGroupAllowlist({
      cfg,
      accountId,
      credentialValues,
      entries,
      prompter,
    }),
});
