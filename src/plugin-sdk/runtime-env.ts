// Shared process/runtime utilities for plugins. This is the public boundary for
// logger wiring, runtime env shims, and global verbose console helpers.

export type { RuntimeEnv } from "../runtime.ts";
export { createNonExitingRuntime, defaultRuntime } from "../runtime.ts";
export {
  danger,
  info,
  isVerbose,
  isYes,
  logVerbose,
  logVerboseConsole,
  setVerbose,
  setYes,
  shouldLogVerbose,
  success,
  warn,
} from "../globals.ts";
export { sleep } from "../utils.ts";
export { withTimeout } from "../utils/with-timeout.ts";
export { isTruthyEnvValue } from "../infra/env.ts";
export * from "../logging.ts";
export { waitForAbortSignal } from "../infra/abort-signal.ts";
export { computeBackoff, sleepWithAbort, type BackoffPolicy } from "../infra/backoff.ts";
export {
  formatDurationPrecise,
  formatDurationSeconds,
} from "../infra/format-time/format-duration.ts";
export { retryAsync } from "../infra/retry.ts";
export { ensureGlobalUndiciEnvProxyDispatcher } from "../infra/net/undici-global-dispatcher.ts";
export {
  registerUncaughtExceptionHandler,
  registerUnhandledRejectionHandler,
} from "../infra/unhandled-rejections.ts";
export { isWSL2Sync } from "../infra/wsl.ts";
