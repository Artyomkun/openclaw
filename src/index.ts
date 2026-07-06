#!/usr/bin/env node
// Re-exports the OpenClaw CLI entry point for package execution.
// Package executable entrypoint that forwards to the CLI bootstrap.
import process from "node:process";
import { fileURLToPath } from "node:url";
import { formatCliFailureLines } from "./cli/failure-output.ts";
import { formatUncaughtError } from "./infra/errors.ts";
import { runFatalErrorHooks } from "./infra/fatal-error-hooks.ts";
import { isMainModule } from "./infra/is-main.ts";
import {
  installUnhandledRejectionHandler,
  isBenignUncaughtExceptionError,
  isUncaughtExceptionHandled,
} from "./infra/unhandled-rejections.ts";

type LibraryExports = typeof import("./library.js");

// These bindings are populated only for library consumers. The CLI entry stays
// on the lean path and must not read them while running as main.
export let applyTemplate: LibraryExports["applyTemplate"];
export let createDefaultDeps: LibraryExports["createDefaultDeps"];
export let deriveSessionKey: LibraryExports["deriveSessionKey"];
export let describePortOwner: LibraryExports["describePortOwner"];
export let ensureBinary: LibraryExports["ensureBinary"];
export let ensurePortAvailable: LibraryExports["ensurePortAvailable"];
export let getReplyFromConfig: LibraryExports["getReplyFromConfig"];
export let handlePortError: LibraryExports["handlePortError"];
export let loadConfig: LibraryExports["loadConfig"];
export let loadSessionStore: LibraryExports["loadSessionStore"];
export let monitorWebChannel: LibraryExports["monitorWebChannel"];
export let normalizeE164: LibraryExports["normalizeE164"];
export let PortInUseError: LibraryExports["PortInUseError"];
export let promptYesNo: LibraryExports["promptYesNo"];
export let resolveSessionKey: LibraryExports["resolveSessionKey"];
export let resolveStorePath: LibraryExports["resolveStorePath"];
export let runCommandWithTimeout: LibraryExports["runCommandWithTimeout"];
export let runExec: LibraryExports["runExec"];
export let saveSessionStore: LibraryExports["saveSessionStore"];
export let waitForever: LibraryExports["waitForever"];

const isMain = isMainModule({
  currentFile: fileURLToPath(import.meta.url),
});

if (!isMain) {
  ({
    applyTemplate,
    createDefaultDeps,
    deriveSessionKey,
    describePortOwner,
    ensureBinary,
    ensurePortAvailable,
    getReplyFromConfig,
    handlePortError,
    loadConfig,
    loadSessionStore,
    monitorWebChannel,
    normalizeE164,
    PortInUseError,
    promptYesNo,
    resolveSessionKey,
    resolveStorePath,
    runCommandWithTimeout,
    runExec,
    saveSessionStore,
    waitForever,
  } = await import("./library.js"));
}

if (isMain) {
  const { restoreTerminalState } = await import("../packages/terminal-core/src/restore.js");

  // Global error handlers to prevent silent crashes from unhandled rejections/exceptions.
  // These log the error and exit gracefully instead of crashing without trace.
  installUnhandledRejectionHandler();

  process.on("uncaughtException", (error) => {
    if (isUncaughtExceptionHandled(error)) {
      return;
    }
    if (isBenignUncaughtExceptionError(error)) {
      console.warn(
        "[openclaw] Non-fatal uncaught exception (continuing):",
        formatUncaughtError(error),
      );
      return;
    }
    for (const line of formatCliFailureLines({
      title: "OpenClaw hit an unexpected runtime error.",
      error,
      argv: process.argv,
    })) {
      console.error(line);
    }
    for (const message of runFatalErrorHooks({ reason: "uncaught_exception", error })) {
      console.error("[openclaw]", message);
    }
    restoreTerminalState("uncaught exception", { resumeStdinIfPaused: false });
    process.exit(1);
  });
}
