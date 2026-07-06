// Narrow IO/runtime facade re-exported for memory host helpers.

export {
  CHARS_PER_TOKEN_ESTIMATE,
  applyWindowsSpawnProgramPolicy,
  createSubsystemLogger,
  detectMime,
  estimateStringChars,
  installProcessWarningFilter,
  materializeWindowsSpawnProgram,
  redactSensitiveText,
  resolveGlobalSingleton,
  resolveUserPath,
  resolveWindowsExecutablePath,
  resolveWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
  runTasksWithConcurrency,
  shortenHomeInString,
  shortenHomePath,
  shouldIgnoreWarning,
  splitShellArgs,
  truncateUtf16Safe,
} from "./openclaw-runtime.js";

export type {
  ProcessWarning,
  ResolveWindowsSpawnProgramCandidateParams,
  ResolveWindowsSpawnProgramParams,
  WindowsSpawnCandidateResolution,
  WindowsSpawnInvocation,
  WindowsSpawnProgram,
  WindowsSpawnProgramCandidate,
  WindowsSpawnResolution,
} from "./openclaw-runtime.js";
