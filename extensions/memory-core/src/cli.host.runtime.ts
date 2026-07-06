/**
 * Memory Core - CLI Host
 */

export {
  colorize,
  defaultRuntime,
  formatErrorMessage,
  isRich,
  resolveCommandSecretRefsViaGateway,
  setVerbose,
  shortenHomeInString,
  shortenHomePath,
  theme,
  withManager,
  withProgress,
  withProgressTotals,
} from "openclaw/plugin-sdk/memory-core-host-runtime-cli";
export {
  getRuntimeConfig,
  resolveDefaultAgentId,
  resolveSessionTranscriptsDirForAgent,
  resolveStateDir,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/memory-core-host-runtime-core";
export {
  listMemoryFiles,
  normalizeExtraMemoryPaths,
} from "openclaw/plugin-sdk/memory-core-host-runtime-files";
export { getMemorySearchManager } from "./memory/index.js";

export async function formatFileSize(bytes: number): Promise<string> {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export async function formatDuration(ms: number): Promise<string> {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export async function safeJsonStringify(obj: unknown): Promise<string> {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export async function isJsonString(str: string): Promise<boolean> {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export async function truncateString(str: string, limit: number = 100): Promise<string> {
  if (str.length <= limit) return str;
  return `${str.slice(0, limit)}...`;
}

export async function escapeTerminal(str: string): Promise<string> {
  return str.replace(/[\\"]/g, "\\$&");
}

export async function isInteractive(): Promise<boolean> {
  return process.stdout.isTTY && process.stdin.isTTY;
}

export async function getCurrentTimestamp(): Promise<string> {
  return new Date().toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; delay?: number } = {}
): Promise<T> {
  const attempts = options.attempts || 3;
  const delay = options.delay || 1000;
  
  let lastError: Error | undefined;
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < attempts - 1) {
        await sleep(delay * (i + 1));
      }
    }
  }
  
  throw lastError || new Error("Retry failed");
}

export async function logWithLevel(level: "info" | "warn" | "error" | "debug", msg: string): Promise<void> {
  const prefix = {
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
    debug: "🐛",
  }[level];
  
  const timestamp = new Date().toISOString();
  const fullMsg = `${timestamp} ${prefix} ${msg}`;
  
  if (level === "error") {
    console.error(fullMsg);
  } else {
    console.log(fullMsg);
  }
}

export const logInfo = (msg: string) => logWithLevel("info", msg);
export const logWarn = (msg: string) => logWithLevel("warn", msg);
export const logError = (msg: string) => logWithLevel("error", msg);
export const logDebug = (msg: string) => logWithLevel("debug", msg);

export default {
  formatFileSize,
  formatDuration,
  safeJsonStringify,
  isJsonString,
  truncateString,
  escapeTerminal,
  isInteractive,
  getCurrentTimestamp,
  sleep,
  retry,
  logWithLevel,
  logInfo,
  logWarn,
  logError,
  logDebug,
};