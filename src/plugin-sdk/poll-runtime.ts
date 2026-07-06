/**
 * Runtime SDK subpath for poll input normalization and selection limits.
 */
export type { NormalizedPollInput, PollInput } from "../polls.ts";
export {
  normalizePollDurationHours,
  normalizePollInput,
  resolvePollMaxSelections,
} from "../polls.ts";
