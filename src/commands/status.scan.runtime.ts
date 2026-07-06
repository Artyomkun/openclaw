// Runtime helpers loaded lazily by status overview scans.
// Kept as a tiny barrel so channel status code is only imported when channel data is requested.

import { collectChannelStatusIssues } from "../infra/channels-status-issues.ts";
import { buildChannelsTable } from "./status-all/channels.ts";

export const statusScanRuntime = {
  collectChannelStatusIssues,
  buildChannelsTable,
};
