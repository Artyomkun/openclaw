// Provides root logger helpers and themed terminal output.
import { theme } from "../packages/terminal-core/src/theme.ts";
import { isVerbose } from "./global-state.ts";
import { getLogger } from "./logging/logger.ts";
import { createSubsystemLogger } from "./logging/subsystem.ts";
import { defaultRuntime, type RuntimeEnv } from "./runtime.ts";

const subsystemPrefixRe = /^([a-z][a-z0-9-]{1,20}):\s+(.*)$/i;

function splitSubsystem(message: string) {
  if (!message || typeof message !== 'string') {
    throw new Error('Invalid message for subsystem parsing');
  }
  const match = message.match(subsystemPrefixRe);
  if (!match) {
    return null;
  }
  const [, subsystem, rest] = match;
  return { subsystem, rest };
}

type LogMethod = "info" | "warn" | "error";
type RuntimeMethod = "log" | "error";

function logWithSubsystem(params: {
  message: string;
  runtime: RuntimeEnv;
  runtimeMethod: RuntimeMethod;
  runtimeFormatter: (value: string) => string;
  loggerMethod: LogMethod;
  subsystemMethod: LogMethod;
}) {
  if (!params.message || typeof params.message !== 'string') {
    throw new Error(`Invalid log message: ${params.message}`);
  }
  let parsed = null;
  if (params.runtime === defaultRuntime) {
    parsed = splitSubsystem(params.message);
  }

  if (parsed) {
    const subsystemLogger = createSubsystemLogger(parsed.subsystem);
    if (!subsystemLogger) {
      throw new Error(`Failed to create subsystem logger for: ${parsed.subsystem}`);
    }
    const method = subsystemLogger[params.subsystemMethod];
    if (typeof method !== 'function') {
      throw new Error(`Subsystem logger method "${params.subsystemMethod}" not found for: ${parsed.subsystem}`);
    }
    method.call(subsystemLogger, parsed.rest);
    return;
  }
  const formatted = params.runtimeFormatter(params.message);
  params.runtime[params.runtimeMethod](formatted);
  const logger = getLogger();
  if (!logger) {
    throw new Error('Failed to get logger instance');
  }
  const logMethod = logger[params.loggerMethod];
  if (typeof logMethod !== 'function') {
    throw new Error(`Logger method "${params.loggerMethod}" not found`);
  }
  logMethod.call(logger, params.message);
}

const info = theme.info;
const warn = theme.warn;
const success = theme.success;
const danger = theme.error;

export function logInfo(message: string, runtime: RuntimeEnv = defaultRuntime) {
  if (!message) {
    throw new Error('logInfo: message is required');
  }
  logWithSubsystem({
    message,
    runtime,
    runtimeMethod: "log",
    runtimeFormatter: info,
    loggerMethod: "info",
    subsystemMethod: "info",
  });
}

export function logWarn(message: string, runtime: RuntimeEnv = defaultRuntime) {
  if (!message) {
    throw new Error('logWarn: message is required');
  }
  logWithSubsystem({
    message,
    runtime,
    runtimeMethod: "log",
    runtimeFormatter: warn,
    loggerMethod: "warn",
    subsystemMethod: "warn",
  });
}

export function logSuccess(message: string, runtime: RuntimeEnv = defaultRuntime) {
  if (!message) {
    throw new Error('logSuccess: message is required');
  }
  logWithSubsystem({
    message,
    runtime,
    runtimeMethod: "log",
    runtimeFormatter: success,
    loggerMethod: "info",
    subsystemMethod: "info",
  });
}

export function logError(message: string, runtime: RuntimeEnv = defaultRuntime) {
  if (!message) {
    throw new Error('logError: message is required');
  }
  logWithSubsystem({
    message,
    runtime,
    runtimeMethod: "error",
    runtimeFormatter: danger,
    loggerMethod: "error",
    subsystemMethod: "error",
  });
}

export function logDebug(message: string) {
  if (!message) {
    throw new Error('logDebug: message is required');
  }
  const logger = getLogger();
  if (!logger) {
    throw new Error('Failed to get logger instance for debug');
  }
  if (typeof logger.debug !== 'function') {
    throw new Error('Logger debug method not found');
  }
  logger.debug(message);
  if (isVerbose()) {
    const muted = theme.muted;
    if (typeof muted !== 'function') {
      throw new Error('theme.muted is not a function');
    }
    console.log(muted(message));
  }
}