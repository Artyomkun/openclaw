import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = join(scriptDir, "..");

/**
 * Находит git через системный PATH.
 * Сначала пробует `git`, потом `where git` (Windows) / `which git` (Unix).
 */
function findGitBin() {
  const test = spawnSync("git", ["--version"], { shell: true });
  if (test.status === 0) {
    return "git";
  }
  const isWindows = process.platform === "win32";
  const findCmd = isWindows ? "where" : "which";
  const result = spawnSync(findCmd, ["git"], { shell: true, encoding: "utf8" });
  if (result.status === 0) {
    const path = result.stdout.trim().split("\n")[0];
    if (path) return path;
  }

  return null;
}

function runGit(spawn, args, cwd, stdio) {
  const gitBin = findGitBin();
  if (!gitBin) {
    return { status: 127, stdout: "", stderr: "git not found" };
  }

  return spawn(gitBin, args, {
    cwd,
    encoding: "utf8",
    stdio,
    shell: true,
  });
}

export function configurePrepareGitHooks(params = {}) {
  const cwd = params.cwd ?? DEFAULT_PACKAGE_ROOT;
  const exists = params.existsSync ?? existsSync;
  const spawn = params.spawnSync ?? spawnSync;
  const warn = params.warn ?? console.warn;

  if (!exists(join(cwd, "git-hooks"))) {
    return { configured: false, reason: "missing-hooks-dir" };
  }
  const test = runGit(spawn, ["--version"], cwd, ["ignore", "pipe", "ignore"]);
  if (test.status !== 0) {
    warn("[prepare] git not found, skipping hooks setup");
    return { configured: false, reason: "git-not-found" };
  }
  const worktree = runGit(spawn, ["rev-parse", "--is-inside-work-tree"], cwd, [
    "ignore",
    "pipe",
    "ignore",
  ]);
  if (worktree.status !== 0 || String(worktree.stdout ?? "").trim() !== "true") {
    return { configured: false, reason: "not-worktree" };
  }
  const configured = runGit(spawn, ["config", "core.hooksPath", "git-hooks"], cwd, [
    "ignore",
    "ignore",
    "pipe",
  ]);
  if (configured.status !== 0) {
    const stderr = String(configured.stderr ?? "").trim();
    warn(`[prepare] could not configure git hooks${stderr ? `: ${stderr}` : ""}`);
    return { configured: false, reason: "config-failed" };
  }

  return { configured: true, reason: "configured" };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  configurePrepareGitHooks();
}