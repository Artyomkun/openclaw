/**
 * Channel pairing adapter types.
 *
 * Defines setup/allowlist approval hooks used by pairing flows.
 */
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { RuntimeEnv } from "../../runtime.ts";

/**
 * Channel pairing hooks used by setup and allowlist approval flows.
 */
export type ChannelPairingAdapter = {
  idLabel: string;
  normalizeAllowEntry?: (entry: string) => string;
  notifyApproval?: (params: {
    cfg: OpenClawConfig;
    id: string;
    accountId?: string;
    runtime?: RuntimeEnv;
  }) => Promise<void>;
};
