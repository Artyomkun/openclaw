// Focused low-level text/runtime helpers used by bundled plugins.

export {
  CONFIG_DIR,
  clamp,
  clampInt,
  clampNumber,
  displayPath,
  displayString,
  ensureDir,
  escapeRegExp,
  normalizeE164,
  pathExists,
  resolveConfigDir,
  resolveHomeDir,
  resolveUserPath,
  safeParseJson,
  shortenHomeInString,
  shortenHomePath,
  sleep,
  sliceUtf16Safe,
  truncateUtf16Safe,
} from "../utils.ts";
export { fetchWithTimeout } from "../utils/fetch-timeout.ts";
export { withTimeout } from "../utils/with-timeout.ts";
