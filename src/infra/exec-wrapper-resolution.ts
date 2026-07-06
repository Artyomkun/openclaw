// Wrapper resolution facade for executable tokens, dispatch wrappers, and shell
// multiplexers used by exec approval policy.
export { basenameLower, normalizeExecutableToken } from "./exec-wrapper-tokens.ts";
export {
  extractEnvAssignmentKeysFromDispatchWrappers,
  isDispatchWrapperExecutable,
  resolveDispatchWrapperTrustPlan,
  unwrapDispatchWrappersForResolution,
  unwrapEnvInvocation,
  unwrapKnownDispatchWrapperInvocation,
} from "./dispatch-wrapper-resolution.ts";
export {
  extractBindableShellWrapperInlineCommand,
  extractShellWrapperCommand,
  extractShellWrapperInlineCommand,
  hasEnvManipulationBeforeShellWrapper,
  isBlockedShellWrapperCommand,
  isShellWrapperExecutable,
  isShellWrapperInvocation,
  POSIX_SHELL_WRAPPERS,
  POWERSHELL_WRAPPERS,
  resolveShellWrapperTransportArgv,
  unwrapKnownShellMultiplexerInvocation,
} from "./shell-wrapper-resolution.ts";
