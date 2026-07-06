// Re-exports global CLI flag state used across command modules.
export { isVerbose, isYes, setVerbose, setYes } from "./global-state.ts";
import { theme } from "../packages/terminal-core/src/theme.ts";
import { isVerbose } from "./global-state.ts";
import { getLogger, isFileLogLevelEnabled } from "./logging/logger.ts";

export function shouldLogVerbose() {
  return isVerbose() || isFileLogLevelEnabled("debug");
}

export function logVerbose(message: string) {
  if (!shouldLogVerbose()) {
    return;
  }
  try {
    getLogger().debug({ message }, "verbose");
  } catch {
    // ignore logger failures to avoid breaking verbose printing
  }
  if (!isVerbose()) {
    return;
  }
  console.log(theme.muted(message));
}

export function logVerboseConsole(message: string) {
  if (!isVerbose()) {
    return;
  }
  console.log(theme.muted(message));
}

type ThemeFormatter = (value: string) => string;

export const success: ThemeFormatter = theme.success;
export const warn: ThemeFormatter = theme.warn;
export const info: ThemeFormatter = theme.info;
export const danger: ThemeFormatter = theme.error;
