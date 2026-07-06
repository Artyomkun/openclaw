/**
 * Public sandbox barrel for agent runtime code.
 *
 * Keep sandbox implementation modules behind this export surface so callers use
 * the same config, backend, Docker, SSH, filesystem, and policy contracts.
 */
export {
  resolveSandboxBrowserConfig,
  resolveSandboxConfigForAgent,
  resolveSandboxDockerConfig,
  resolveSandboxPruneConfig,
  resolveSandboxScope,
} from "./sandbox/config.ts";
export {
  DEFAULT_SANDBOX_BROWSER_IMAGE,
  DEFAULT_SANDBOX_COMMON_IMAGE,
  DEFAULT_SANDBOX_IMAGE,
} from "./sandbox/constants.ts";
export { ensureSandboxWorkspaceForSession, resolveSandboxContext } from "./sandbox/context.ts";
export {
  getSandboxBackendFactory,
  getSandboxBackendManager,
  getSandboxBackendWorkdirResolver,
  registerSandboxBackend,
  requireSandboxBackendFactory,
} from "./sandbox/backend.ts";

export { buildSandboxCreateArgs, isDockerDaemonUnavailable } from "./sandbox/docker.ts";
export {
  listSandboxBrowsers,
  listSandboxContainers,
  removeSandboxBrowserContainer,
  removeSandboxContainer,
  type SandboxBrowserInfo,
  type SandboxContainerInfo,
} from "./sandbox/manage.ts";
export {
  formatSandboxToolPolicyBlockedMessage,
  resolveSandboxRuntimeStatus,
} from "./sandbox/runtime-status.ts";

export { isToolAllowed, resolveSandboxToolPolicyForAgent } from "./sandbox/tool-policy.ts";
export type { SandboxFsBridge, SandboxFsStat, SandboxResolvedPath } from "./sandbox/fs-bridge.ts";
export {
  buildExecRemoteCommand,
  buildRemoteWorkdirValidationCommand,
  buildRemoteCommand,
  buildSshSandboxArgv,
  buildValidatedExecRemoteCommand,
  createSshSandboxSessionFromConfigText,
  createSshSandboxSessionFromSettings,
  disposeSshSandboxSession,
  runSshSandboxCommand,
  shellEscape,
  uploadDirectoryToSshTarget,
} from "./sandbox/ssh.ts";
export { sanitizeEnvVars } from "./sandbox/sanitize-env-vars.ts";
export { createRemoteShellSandboxFsBridge } from "./sandbox/remote-fs-bridge.ts";
export { createWritableRenameTargetResolver } from "./sandbox/fs-bridge-rename-targets.ts";
export { resolveWritableRenameTargets } from "./sandbox/fs-bridge-rename-targets.ts";
export { resolveWritableRenameTargetsForBridge } from "./sandbox/fs-bridge-rename-targets.ts";

export type {
  CreateSandboxBackendParams,
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxBackendExecSpec,
  SandboxBackendFactory,
  SandboxBackendHandle,
  SandboxBackendId,
  SandboxBackendManager,
  SandboxBackendPreparedWorkdirDiscarder,
  SandboxBackendRegistration,
  SandboxBackendRuntimeInfo,
  SandboxBackendWorkdirValidation,
  SandboxBackendWorkdirResolver,
  SandboxBackendWorkdirValidator,
} from "./sandbox/backend.ts";
export type { RemoteShellSandboxHandle } from "./sandbox/remote-fs-bridge.ts";
export type {
  RunSshSandboxCommandParams,
  SshSandboxSession,
  SshSandboxSettings,
} from "./sandbox/ssh.ts";

export type {
  SandboxBrowserConfig,
  SandboxBrowserContext,
  SandboxConfig,
  SandboxContext,
  SandboxDockerConfig,
  SandboxPruneConfig,
  SandboxScope,
  SandboxSshConfig,
  SandboxToolPolicy,
  SandboxToolPolicyResolved,
  SandboxToolPolicySource,
  SandboxWorkspaceAccess,
  SandboxWorkspaceInfo,
} from "./sandbox/types.ts";
