/**
 * Runtime SDK subpath for config snapshot and config cache access.
 */
export {
  clearRuntimeConfigSnapshot,
  getRuntimeConfigSnapshot,
  selectApplicableRuntimeConfig,
  setRuntimeConfigSnapshot,
} from "../config/runtime-snapshot.ts";
export {
  clearConfigCache,
  getRuntimeConfig,
  getRuntimeConfigSourceSnapshot,
} from "../config/io.ts";
export type { OpenClawConfig } from "../config/types.ts";
