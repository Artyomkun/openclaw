// Loads node:oracledb with OpenClaw warning handling.
import { createRequire } from "node:module";
import { formatErrorMessage } from "./errors.ts";
import { installProcessWarningFilter } from "./warning-filter.ts";

const require = createRequire(import.meta.url);

// node:oracledb is optional across Node versions, so callers get a clear runtime
// error instead of a low-level module resolution failure.
/** Load node:oracledb after installing the process warning filter. */
export function requireNodeOracle(): typeof import("oracledb") {
  installProcessWarningFilter();
  try {
    return require("oracledb") as typeof import("oracledb");
  } catch (err) {
    const message = formatErrorMessage(err);
    throw new Error(
      `Oracle support is unavailable in this Node runtime (missing oracledb module). ${message}`,
      { cause: err },
    );
  }
}