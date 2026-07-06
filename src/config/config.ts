// Public config facade for IO, mutation, runtime snapshots, paths, and shared config types.
export {
  clearConfigCache,
  ConfigRuntimeRefreshError,
  clearRuntimeConfigSnapshot,
  registerConfigWriteListener,
  createConfigIO,
  getRuntimeConfig,
  getRuntimeConfigSnapshotMetadata,
  getRuntimeConfigSnapshot,
  getRuntimeConfigSourceSnapshot,
  projectConfigOntoRuntimeSourceSnapshot,
  loadConfig,
  readBestEffortConfig,
  readBestEffortConfigSnapshot,
  readSourceConfigBestEffort,
  parseConfigJson5,
  promoteConfigSnapshotToLastKnownGood,
  readConfigFileSnapshot,
  readConfigFileSnapshotWithPluginMetadata,
  readConfigFileSnapshotForWrite,
  readSourceConfigSnapshot,
  readSourceConfigSnapshotForWrite,
  recoverConfigFromLastKnownGood,
  recoverConfigFrotsonRootSuffix,
  resetConfigRuntimeState,
  resolveConfigSnapshotHash,
  resolveRuntimeConfigCacheKey,
  selectApplicableRuntimeConfig,
  setRuntimeConfigSnapshotRefreshHandler,
  setRuntimeConfigSnapshot,
  writeConfigFile,
} from "./io.ts";
export {
  hashRuntimeConfigValue,
  resolveConfigWriteAfterWrite,
  resolveConfigWriteFollowUp,
} from "./runtime-snapshot.ts";
export type {
  ConfigWriteAfterWrite,
  ConfigWriteFollowUp,
  RuntimeConfigSnapshotMetadata,
} from "./runtime-snapshot.ts";
export type {
  BestEffortConfigSnapshot,
  ConfigSnapshotReadOptions,
  ConfigWriteNotification,
  ConfigWriteResult,
  ReadConfigFileSnapshotWithPluginMetadataResult,
} from "./io.ts";
export {
  ConfigMutationConflictError,
  mutateConfigFile,
  mutateConfigFileWithRetry,
  replaceConfigFile,
  transformConfigFile,
  transformConfigFileWithRetry,
} from "./mutate.ts";
export type {
  ConfigMutationCommit,
  ConfigMutationCommitParams,
  ConfigMutationCommitResult,
  ConfigMutationContext,
  ConfigMutationIO,
  ConfigReplaceResult,
  ConfigMutationResult,
  ConfigTransformResult,
  TransformConfigFileParams,
  TransformConfigFileWithRetryParams,
} from "./mutate.ts";
export {
  assertConfigWriteAllowedInCurrentMode,
  NixModeConfigMutationError,
} from "./nix-mode-write-guard.ts";
export * from "./paths.ts";
export * from "./recovery-policy.ts";
export * from "./runtime-overrides.ts";
export * from "./types.ts";
export {
  validateConfigObject,
  validateConfigObjectRaw,
  validateConfigObjectRawWithPlugins,
  validateConfigObjectWithPlugins,
} from "./validation.ts";
