// Safe local-file helpers for plugin runtime media and bridge code.

export {
  readFileWithinRoot,
  readLocalFileFromRoots,
  root,
  writeFileWithinRoot,
} from "../infra/fs-safe.ts";
export { basenameFromMediaSource, safeFileURLToPath } from "../infra/local-file-access.ts";
