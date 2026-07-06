#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import module from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================
// Node.js 24+ Required (ES2026)
// ============================================================

const MIN_NODE_MAJOR = 24;
const MIN_NODE_MINOR = 0;
const MIN_NODE_VERSION = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`;

const parseNodeVersion = (rawVersion: string) => {
  const [majorRaw = "0", minorRaw = "0"] = rawVersion.split(".");
  return {
    major: Number(majorRaw),
    minor: Number(minorRaw),
  };
};

const isSupportedNodeVersion = (version: ReturnType<typeof parseNodeVersion>) =>
  version.major > MIN_NODE_MAJOR ||
  (version.major === MIN_NODE_MAJOR && version.minor >= MIN_NODE_MINOR);

const ensureSupportedNodeVersion = () => {
  if (isSupportedNodeVersion(parseNodeVersion(process.versions.node))) {
    return;
  }

  process.stderr.write(
    `openclaw: Node.js v${MIN_NODE_VERSION}+ is required (current: v${process.versions.node}).\n` +
      "If you use nvm, run:\n" +
      `  nvm install ${MIN_NODE_MAJOR}\n` +
      `  nvm use ${MIN_NODE_MAJOR}\n` +
      `  nvm alias default ${MIN_NODE_MAJOR}\n`,
  );
  process.exit(1);
};

ensureSupportedNodeVersion();

// ============================================================
// Launcher Helpers — Simplified for 2026
// ============================================================

const normalizeLauncherMetadataValue = (value: string | undefined) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed && trimmed !== "undefined" && trimmed !== "null" ? trimmed : undefined;
};

const readLauncherJson = (relativePath: string) => {
  try {
    return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
  } catch {
    return null;
  }
};

const resolveLauncherVersion = () => {
  const packageJson = readLauncherJson("./package.json");
  const packageVersion = normalizeLauncherMetadataValue(packageJson?.version);
  if (packageVersion) return packageVersion;
  const buildInfo = readLauncherJson("./dist/build-info.json");
  const buildVersion = normalizeLauncherMetadataValue(buildInfo?.version);
  if (buildVersion) return buildVersion;
  return normalizeLauncherMetadataValue(process.env.OPENCLAW_BUNDLED_VERSION) ?? "0.0.0";
};

const resolveLauncherCommit = () => {
  const envCommit = formatLauncherCommit(process.env.GIT_COMMIT ?? process.env.GIT_SHA);
  if (envCommit) return envCommit;
  return (
    readLauncherGitCommit() ??
    formatLauncherCommit(readLauncherJson("./dist/build-info.json")?.commit) ??
    formatLauncherCommit(readLauncherJson("./package.json")?.gitHead) ??
    formatLauncherCommit(readLauncherJson("./package.json")?.githead)
  );
};

function formatLauncherCommit(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/[0-9a-fA-F]{7,40}/);
  return match ? match[0].slice(0, 7).toLowerCase() : null;
}

function readLauncherGitCommit() {
  try {
    const gitPath = fileURLToPath(new URL("./.git", import.meta.url));
    const headPath = resolveLauncherGitHeadPath(gitPath);
    if (!headPath) return null;
    const head = readFileSync(headPath, "utf8").trim();
    if (!head) return null;
    if (!head.startsWith("ref:")) return formatLauncherCommit(head);
    const ref = head.replace(/^ref:\s*/i, "").trim();
    if (!ref.startsWith("refs/") || path.isAbsolute(ref) || ref.split("/").includes("..")) return null;
    const refsBase = resolveLauncherGitRefsBase(headPath);
    const refPath = path.resolve(refsBase, ref);
    const rel = path.relative(refsBase, refPath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
    try {
      return formatLauncherCommit(readFileSync(refPath, "utf8"));
    } catch {
      return readLauncherPackedRef(refsBase, ref);
    }
  } catch {
    return null;
  }
}

function resolveLauncherGitHeadPath(gitPath: string) {
  try {
    if (statSync(gitPath).isDirectory()) {
      return path.join(gitPath, "HEAD");
    }
    const raw = readFileSync(gitPath, "utf8").trim();
    if (!raw.startsWith("gitdir:")) return null;
    return path.join(
      path.resolve(path.dirname(gitPath), raw.slice("gitdir:".length).trim()),
      "HEAD",
    );
  } catch {
    return null;
  }
}

function resolveLauncherGitRefsBase(headPath: string) {
  const gitDir = path.dirname(headPath);
  try {
    const commonDir = readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
    return commonDir ? path.resolve(gitDir, commonDir) : gitDir;
  } catch {
    return gitDir;
  }
}

function readLauncherPackedRef(refsBase: string, ref: string) {
  try {
    const packedRefs = readFileSync(path.join(refsBase, "packed-refs"), "utf8");
    for (const line of packedRefs.split("\n")) {
      if (!line || line.startsWith("#") || line.startsWith("^")) continue;
      const [commit, packedRef] = line.trim().split(/\s+/, 2);
      if (packedRef === ref) return formatLauncherCommit(commit);
    }
  } catch {
    // fall through
  }
  return null;
}

const tryOutputLauncherVersion = (argv: string[]) => {
  try {
    if (normalizeLauncherMetadataValue(process.env.OPENCLAW_CONTAINER)) return false;
    if (argv.length !== 3 || !["--version", "-V", "-v"].includes(argv[2])) return false;
    const version = resolveLauncherVersion();
    const commit = resolveLauncherCommit();
    process.stdout.write(commit ? `OpenClaw ${version} (${commit})\n` : `OpenClaw ${version}\n`);
    return true;
  } catch {
    return false;
  }
};

if (tryOutputLauncherVersion(process.argv)) {
  process.exit(0);
}

// ============================================================
// Compile Cache — Node.js 24+ Native
// ============================================================

const isSourceCheckoutLauncher = () =>
  existsSync(new URL("./.git", import.meta.url)) ||
  existsSync(new URL("./src/entry.ts", import.meta.url));

const isNodeCompileCacheDisabled = () => process.env.NODE_DISABLE_COMPILE_CACHE !== undefined;

const sanitizeCompileCachePathSegment = (value: string) => {
  const normalized = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "unknown";
};

const readPackageVersion = () => {
  try {
    const parsed = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
    if (typeof parsed?.version === "string" && parsed.version.trim().length > 0) {
      return parsed.version;
    }
  } catch {
    // fall through
  }
  return "unknown";
};

const resolvePackagedCompileCacheDirectory = () => {
  const packageJsonUrl = new URL("./package.json", import.meta.url);
  const version = sanitizeCompileCachePathSegment(readPackageVersion());
  let installMarker = "no-package-json";
  try {
    const stat = statSync(packageJsonUrl);
    installMarker = `${Math.trunc(stat.mtimeMs)}-${stat.size}`;
  } catch {
    // fall through
  }
  const baseDirectory = process.env.NODE_COMPILE_CACHE ?? path.join(os.tmpdir(), "node-compile-cache");
  return path.join(baseDirectory, "openclaw", version, sanitizeCompileCachePathSegment(installMarker));
};

// ============================================================
// Respawn Logic — Simplified
// ============================================================

const respawnSignals =
  process.platform === "win32"
    ? ["SIGTERM", "SIGINT", "SIGBREAK"]
    : ["SIGTERM", "SIGINT", "SIGHUP", "SIGQUIT"];

const runRespawnedChild = (command: string, args: string[], env: NodeJS.ProcessEnv) => {
  const child = spawn(command, args, { stdio: "inherit", env });
  const listeners = new Map();

  let signalExitTimer: NodeJS.Timeout | null = null;
  let signalForceKillTimer: NodeJS.Timeout | null = null;
  let signalHardExitTimer: NodeJS.Timeout | null = null;

  const detach = () => {
    for (const [signal, listener] of listeners) {
      process.off(signal, listener);
    }
    listeners.clear();
    if (signalExitTimer) { clearTimeout(signalExitTimer); signalExitTimer = null; }
    if (signalForceKillTimer) { clearTimeout(signalForceKillTimer); signalForceKillTimer = null; }
    if (signalHardExitTimer) { clearTimeout(signalHardExitTimer); signalHardExitTimer = null; }
  };

  const forceKillChild = () => {
    try {
      child.kill(process.platform === "win32" ? "SIGTERM" : "SIGKILL");
    } catch {
      // best effort
    }
  };

  const requestChildTermination = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      // best effort
    }
    signalForceKillTimer = setTimeout(() => {
      forceKillChild();
      signalHardExitTimer = setTimeout(() => { process.exit(1); }, 1_000);
      signalHardExitTimer.unref?.();
    }, 1_000);
    signalForceKillTimer.unref?.();
  };

  const scheduleParentExit = () => {
    if (signalExitTimer) return;
    signalExitTimer = setTimeout(() => { requestChildTermination(); }, 1_000);
    signalExitTimer.unref?.();
  };

  for (const signal of respawnSignals) {
    const listener = () => {
      try { child.kill(signal); } catch { /* best effort */ }
      scheduleParentExit();
    };
    try {
      process.on(signal, listener);
      listeners.set(signal, listener);
    } catch {
      // unsupported signal on this platform
    }
  }

  child.once("exit", (code, signal) => {
    detach();
    if (signal) { process.exit(1); }
    process.exit(code ?? 1);
  });

  child.once("error", (error) => {
    detach();
    process.stderr.write(
      `[openclaw] Failed to respawn: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  });

  return true;
};

const respawnWithoutCompileCacheIfNeeded = () => {
  if (!isSourceCheckoutLauncher()) return false;
  if (process.env.OPENCLAW_COMPILE_CACHE_DISABLED_RESPAWNED === "1") return false;
  if (!module.getCompileCacheDir?.()) return false;

  const env = {
    ...process.env,
    NODE_DISABLE_COMPILE_CACHE: "1",
    OPENCLAW_COMPILE_CACHE_DISABLED_RESPAWNED: "1",
  };
  delete env.NODE_COMPILE_CACHE;
  return runRespawnedChild(
    process.execPath,
    [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    env,
  );
};

const respawnWithPackagedCompileCacheIfNeeded = () => {
  if (isSourceCheckoutLauncher()) return false;
  if (isNodeCompileCacheDisabled()) return false;
  if (process.env.OPENCLAW_PACKAGED_COMPILE_CACHE_RESPAWNED === "1") return false;

  const currentDirectory = module.getCompileCacheDir?.();
  if (!currentDirectory) return false;

  const desiredDirectory = resolvePackagedCompileCacheDirectory();
  if (path.resolve(currentDirectory) === path.resolve(desiredDirectory)) return false;

  const env = {
    ...process.env,
    NODE_COMPILE_CACHE: desiredDirectory,
    OPENCLAW_PACKAGED_COMPILE_CACHE_RESPAWNED: "1",
  };
  return runRespawnedChild(
    process.execPath,
    [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    env,
  );
};

const waitingForCompileCacheRespawn =
  respawnWithoutCompileCacheIfNeeded() || respawnWithPackagedCompileCacheIfNeeded();

if (
  !waitingForCompileCacheRespawn &&
  module.enableCompileCache &&
  !isNodeCompileCacheDisabled() &&
  !isSourceCheckoutLauncher()
) {
  try {
    module.enableCompileCache(resolvePackagedCompileCacheDirectory());
  } catch {
    // ignore
  }
}

// ============================================================
// Help System — Precomputed Help
// ============================================================

const LAUNCHER_HELP_FLAGS = new Set(["-h", "--help"]);
const LAUNCHER_ROOT_BOOLEAN_FLAGS = new Set(["--dev", "--no-color"]);
const LAUNCHER_ROOT_VALUE_FLAGS = new Set(["--profile", "--log-level", "--container"]);

const isBareRootHelpInvocation = (argv: string[]) =>
  argv.length === 3 && (argv[2] === "--help" || argv[2] === "-h");

const resolveLauncherHomeDir = () => {
  const explicit = normalizeLauncherMetadataValue(process.env.OPENCLAW_HOME);
  if (explicit) return path.resolve(explicit);
  const home = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
  return path.resolve(home);
};

const resolveLauncherUserPath = (input: string) => {
  if (input === "~") return resolveLauncherHomeDir();
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(resolveLauncherHomeDir(), input.slice(2));
  }
  return path.resolve(input);
};

const resolveLauncherConfigPaths = () => {
  const explicit = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (explicit) return [resolveLauncherUserPath(explicit)];
  const stateOverride = process.env.OPENCLAW_STATE_DIR?.trim();
  if (stateOverride) {
    const stateDir = resolveLauncherUserPath(stateOverride);
    return [path.join(stateDir, "openclaw.json")];
  }
  const homeDir = resolveLauncherHomeDir();
  return [
    path.join(homeDir, ".openclaw", "openclaw.json"),
  ];
};

const shouldDeferRootHelpToRuntimeEntry = () => {
  if (process.env.OPENCLAW_BUNDLED_PLUGINS_DIR?.trim()) return true;
  if (process.env.OPENCLAW_DISABLE_BUNDLED_PLUGINS?.trim()) return true;
  for (const configPath of resolveLauncherConfigPaths()) {
    try {
      const raw = readFileSync(configPath, "utf8");
      return /\bplugins\b|\$include\b/.test(raw);
    } catch {
      continue;
    }
  }
  return false;
};

const loadPrecomputedHelpText = (key: string) => {
  try {
    const raw = readFileSync(new URL("./dist/cli-startup-metadata.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw);
    const value = parsed?.[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
};

const tryOutputBareRootHelp = async () => {
  if (!isBareRootHelpInvocation(process.argv)) return false;
  if (shouldDeferRootHelpToRuntimeEntry()) return false;
  const precomputed = loadPrecomputedHelpText("rootHelpText");
  if (precomputed) {
    process.stdout.write(precomputed);
    return true;
  }
  try {
    const mod = await import("./dist/cli/program/root-help.js");
    if (typeof mod.outputRootHelp === "function") {
      await mod.outputRootHelp();
      return true;
    }
  } catch {
    // fall through
  }
  return false;
};

// ============================================================
// Entry Point
// ============================================================

if (!waitingForCompileCacheRespawn) {
  if (!process.env.OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH && (await tryOutputBareRootHelp())) {
    // OK
  } else {
    // Install warning filter
    try {
      const mod = await import("./dist/warning-filter.js");
      if (typeof mod.installProcessWarningFilter === "function") {
        mod.installProcessWarningFilter();
      }
    } catch {
      // ignore
    }

    try {
      await import("./dist/entry.js");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
        const lines = [
          "openclaw: missing dist/entry.js (build output).",
          "Build locally with `pnpm install && pnpm build`, or install a built package instead.",
        ];
        throw new Error(lines.join("\n"));
      }
      throw err;
    }
  }
}