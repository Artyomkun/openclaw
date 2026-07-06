// Channel setup contracts expose setup wizard hooks and account config writes to plugins.
import type { ChannelSetupWizard } from "../channels/plugins/setup-wizard-types.ts";
import type { ChannelSetupAdapter } from "../channels/plugins/types.adapters.ts";
import {
  createOptionalChannelSetupAdapter,
  createOptionalChannelSetupWizard,
} from "./optional-channel-setup.ts";

export type { ChannelSetupAdapter } from "../channels/plugins/types.adapters.ts";
export type { ChannelSetupInput } from "../channels/plugins/types.core.ts";
export type { ChannelSetupDmPolicy, ChannelSetupWizard } from "./setup.ts";
export {
  DEFAULT_ACCOUNT_ID,
  createTopLevelChannelDmPolicy,
  formatDocsLink,
  setSetupChannelEnabled,
  splitSetupEntries,
} from "./setup.ts";

/** Metadata used to advertise an optional channel plugin during setup flows. */
type OptionalChannelSetupParams = {
  /** Channel id shown in setup status and wizard routing. */
  channel: string;
  /** Human-readable plugin name used in install guidance. */
  label: string;
  /** Package spec operators should install to enable the optional channel. */
  npmSpec?: string;
  /** Docs path linked from setup validation and wizard hints. */
  docsPath?: string;
};

/** Paired setup adapter + setup wizard for channels that may not be installed yet. */
export type OptionalChannelSetupSurface = {
  /** Adapter that fails validation with install guidance until the plugin is installed. */
  setupAdapter: ChannelSetupAdapter;
  /** Wizard status/finalize surface that points operators to the missing plugin. */
  setupWizard: ChannelSetupWizard;
};

export {
  createOptionalChannelSetupAdapter,
  createOptionalChannelSetupWizard,
} from "./optional-channel-setup.ts";

/** Build both optional setup surfaces from one metadata object. */
export function createOptionalChannelSetupSurface(
  /** Optional plugin metadata shared by the adapter and wizard. */
  params: OptionalChannelSetupParams,
): OptionalChannelSetupSurface {
  return {
    setupAdapter: createOptionalChannelSetupAdapter(params),
    setupWizard: createOptionalChannelSetupWizard(params),
  };
}
