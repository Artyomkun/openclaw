// Skill install service coordinates skill installation from archives, URLs, and registries.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { resolveBrewExecutable as defaultResolveBrewExecutable } from "../../infra/brew.ts";
import { isContainerEnvironment as defaultIsContainerEnvironment } from "../../infra/container-environment.ts";
import { formatErrorMessage } from "../../infra/errors.ts";
import {
  evaluateSkillInstallPolicy,
  type SkillInstallSpecMetadata,
} from "../../plugins/install-security-scan.ts";
import { runCommandWithTimeout, type CommandOptions } from "../../process/exec.ts";
import { resolveUserPath } from "../../utils.ts";
import {
  hasBinary as defaultHasBinary,
  resolveSkillsInstallPreferences as defaultResolveSkillsInstallPreferences,
} from "../loading/config.ts";
import { resolveSkillSource } from "../loading/source.ts";
import { loadWorkspaceSkillEntries as defaultLoadWorkspaceSkillEntries } from "../loading/workspace.ts";
import type { SkillEntry, SkillInstallSpec, SkillsInstallPreferences } from "../types.ts";
import { installDownloadSpec } from "./install-download.ts";
import { formatInstallFailureMessage } from "./install-output.ts";
import type { SkillInstallResult } from "./install-types.ts";

export type SkillInstallRequest = {
  workspaceDir: string;
  skillName: string;
  installId: string;
  timeoutMs?: number;
  config?: OpenClawConfig;
};
export type { SkillInstallResult } from "./install-types.ts";

type SkillsInstallDeps = {
  hasBinary: (bin: string) => boolean;
  loadWorkspaceSkillEntries: typeof defaultLoadWorkspaceSkillEntries;
  resolveNodeInstallStateDir: () => string;
  resolveBrewExecutable: () => string | undefined;
  isContainerEnvironment: () => boolean;
  resolveSkillsInstallPreferences: typeof defaultResolveSkillsInstallPreferences;
};

const defaultSkillsInstallDeps: SkillsInstallDeps = {
  hasBinary: defaultHasBinary,
  loadWorkspaceSkillEntries: defaultLoadWorkspaceSkillEntries,
  resolveNodeInstallStateDir: resolveDefaultNodeInstallStateDir,
  resolveBrewExecutable: defaultResolveBrewExecutable,
  isContainerEnvironment: defaultIsContainerEnvironment,
  resolveSkillsInstallPreferences: defaultResolveSkillsInstallPreferences,
};

let skillsInstallDeps = defaultSkillsInstallDeps;

function getSkillsInstallDeps(): SkillsInstallDeps {
  return skillsInstallDeps;
}

function withWarnings(result: SkillInstallResult, warnings: string[]): SkillInstallResult {
  if (warnings.length === 0) {
    return result;
  }
  return {
    ...result,
    warnings: warnings.slice(),
  };
}

function resolveInstallId(spec: SkillInstallSpec, index: number): string {
  return (spec.id ?? `${spec.kind}-${index}`).trim();
}

function findInstallSpec(entry: SkillEntry, installId: string): SkillInstallSpec | undefined {
  const specs = entry.metadata?.install ?? [];
  for (const [index, spec] of specs.entries()) {
    if (resolveInstallId(spec, index) === installId) {
      return spec;
    }
  }
  return undefined;
}

function normalizeSkillInstallSpec(spec: SkillInstallSpec): SkillInstallSpecMetadata {
  return {
    ...(spec.id ? { id: spec.id } : {}),
    kind: spec.kind,
    ...(spec.label ? { label: spec.label } : {}),
    ...(spec.bins ? { bins: spec.bins.slice() } : {}),
    ...(spec.os ? { os: spec.os.slice() } : {}),
    ...(spec.formula ? { formula: spec.formula } : {}),
    ...(spec.package ? { package: spec.package } : {}),
    ...(spec.module ? { module: spec.module } : {}),
    ...(spec.url ? { url: spec.url } : {}),
    ...(spec.archive ? { archive: spec.archive } : {}),
    ...(spec.extract !== undefined ? { extract: spec.extract } : {}),
    ...(spec.stripComponents !== undefined ? { stripComponents: spec.stripComponents } : {}),
    ...(spec.targetDir ? { targetDir: spec.targetDir } : {}),
  };
}

function buildNodeInstallCommand(packageName: string, prefs: SkillsInstallPreferences): string[] {
  switch (prefs.nodeManager) {
    case "pnpm":
      return ["pnpm", "add", "-g", "--ignore-scripts", packageName];
    case "yarn":
      return ["yarn", "global", "add", "--ignore-scripts", packageName];
    case "bun":
      return ["bun", "add", "-g", "--ignore-scripts", packageName];
    default:
      return ["npm", "install", "-g", "--ignore-scripts", packageName];
  }
}

function resolveDefaultNodeInstallStateDir({
  cwd = process.cwd(),
  getuid = process.getuid?.bind(process),
  homedir = os.homedir,
  platform = process.platform,
}: {
  cwd?: string;
  getuid?: () => number;
  homedir?: () => string;
  platform?: NodeJS.Platform;
} = {}): string {
  if (platform !== "win32" && getuid?.() === 0) {
    return path.join(path.parse(cwd).root, "var", "lib", "openclaw");
  }
  return path.join(homedir(), ".openclaw");
}

async function buildNodeInstallEnv(prefs: SkillsInstallPreferences): Promise<NodeJS.ProcessEnv> {
  if (prefs.nodeManager !== "npm") {
    return {};
  }

  const stateDir = getSkillsInstallDeps().resolveNodeInstallStateDir();
  const prefix = path.join(stateDir, "tools", "node", "npm");
  await fs.promises.mkdir(prefix, { recursive: true, mode: 0o700 });
  return {
    NPM_CONFIG_PREFIX: prefix,
    npm_config_prefix: prefix,
  };
}

// Strict allowlist patterns to prevent option injection and malicious package names.
const SAFE_BREW_FORMULA = /^[a-z0-9][a-z0-9+._@-]*(\/[a-z0-9][a-z0-9+._@-]*){0,2}$/;
const SAFE_NODE_PACKAGE = /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(@[a-z0-9^~>=<.*|-]+)?$/;

function assertSafeInstallerValue(value: string, kind: string, pattern: RegExp): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("-")) {
    return `${kind} value is empty or starts with a dash`;
  }
  if (!pattern.test(trimmed)) {
    return `${kind} value contains invalid characters: ${trimmed}`;
  }
  return null;
}

function buildInstallCommand(
  spec: SkillInstallSpec,
  prefs: SkillsInstallPreferences,
): {
  argv: string[] | null;
  error?: string;
} {
  switch (spec.kind) {
    case "brew": {
      if (!spec.formula) {
        return { argv: null, error: "missing brew formula" };
      }
      const err = assertSafeInstallerValue(spec.formula, "brew formula", SAFE_BREW_FORMULA);
      if (err) {
        return { argv: null, error: err };
      }
      return { argv: ["brew", "install", spec.formula.trim()] };
    }
    case "node": {
      if (!spec.package) {
        return { argv: null, error: "missing node package" };
      }
      const err = assertSafeInstallerValue(spec.package, "node package", SAFE_NODE_PACKAGE);
      if (err) {
        return { argv: null, error: err };
      }
      return {
        argv: buildNodeInstallCommand(spec.package.trim(), prefs),
      };
    }
    case "download": {
      return { argv: null, error: "download install handled separately" };
    }
    default:
      return { argv: null, error: "unsupported installer" };
  }
}

async function resolveBrewBinDir(timeoutMs: number, brewExe?: string): Promise<string | undefined> {
  const deps = getSkillsInstallDeps();
  const exe = brewExe ?? (deps.hasBinary("brew") ? "brew" : deps.resolveBrewExecutable());
  if (!exe) {
    return undefined;
  }

  const prefixResult = await runCommandWithTimeout([exe, "--prefix"], {
    timeoutMs: Math.min(timeoutMs, 30_000),
  });
  if (prefixResult.code === 0) {
    const prefix = prefixResult.stdout.trim();
    if (prefix) {
      return path.join(prefix, "bin");
    }
  }

  for (const candidate of ["/opt/homebrew/bin", "/usr/local/bin"]) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function createInstallFailure(params: {
  message: string;
  stdout?: string;
  stderr?: string;
  code?: number | null;
}): SkillInstallResult {
  return {
    ok: false,
    message: params.message,
    stdout: params.stdout?.trim() ?? "",
    stderr: params.stderr?.trim() ?? "",
    code: params.code ?? null,
  };
}

function createInstallSuccess(result: CommandResult): SkillInstallResult {
  return {
    ok: true,
    message: "Installed",
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    code: result.code,
  };
}

async function runCommandSafely(
  argv: string[],
  optionsOrTimeout: number | CommandOptions,
): Promise<CommandResult> {
  try {
    const result = await runCommandWithTimeout(argv, optionsOrTimeout);
    return {
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    return {
      code: null,
      stdout: "",
      stderr: formatErrorMessage(err),
    };
  }
}

function resolveBrewMissingFailure(spec: SkillInstallSpec): SkillInstallResult {
  const formula = spec.formula ?? "this package";
  if (process.platform === "linux" && getSkillsInstallDeps().isContainerEnvironment()) {
    return createInstallFailure({
      message: `brew not installed — Homebrew is not installed in this Linux container. Build a custom image with Homebrew or install "${formula}" manually using a supported system package before enabling this skill.`,
    });
  }
  const hint =
    process.platform === "linux"
      ? `Homebrew is not installed. Install it from https://brew.sh or install "${formula}" manually using your system package manager (e.g. apt, dnf, pacman).`
      : "Homebrew is not installed. Install it from https://brew.sh";
  return createInstallFailure({ message: `brew not installed — ${hint}` });
}

async function executeInstallCommand(params: {
  argv: string[] | null;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}): Promise<SkillInstallResult> {
  if (!params.argv || params.argv.length === 0) {
    return createInstallFailure({ message: "invalid install command" });
  }

  const result = await runCommandSafely(params.argv, {
    timeoutMs: params.timeoutMs,
    env: params.env,
  });
  if (result.code === 0) {
    return createInstallSuccess(result);
  }

  return createInstallFailure({
    message: formatInstallFailureMessage(result),
    ...result,
  });
}

export async function installSkill(params: SkillInstallRequest): Promise<SkillInstallResult> {
  const timeoutMs = Math.min(Math.max(params.timeoutMs ?? 300_000, 1_000), 900_000);
  const workspaceDir = resolveUserPath(params.workspaceDir);
  const deps = getSkillsInstallDeps();
  const entries = deps.loadWorkspaceSkillEntries(workspaceDir);
  const entry = entries.find((item) => item.skill.name === params.skillName);
  if (!entry) {
    return {
      ok: false,
      message: `Skill not found: ${params.skillName}`,
      stdout: "",
      stderr: "",
      code: null,
    };
  }

  const spec = findInstallSpec(entry, params.installId);
  const warnings: string[] = [];
  const skillSource = resolveSkillSource(entry.skill);
  const normalizedSpec = spec ? normalizeSkillInstallSpec(spec) : undefined;
  const scanResult = await evaluateSkillInstallPolicy({
    config: params.config,
    installId: params.installId,
    ...(normalizedSpec ? { installSpec: normalizedSpec } : {}),
    logger: {
      warn: (message) => warnings.push(message),
    },
    origin: {
      type: skillSource,
      skillName: params.skillName,
      installId: params.installId,
    },
    source:
      skillSource === "openclaw-bundled"
        ? { kind: "bundled", authority: "openclaw", mutable: false, network: false }
        : skillSource === "openclaw-managed" || skillSource === "openclaw-extra"
          ? { kind: "managed", authority: "openclaw", mutable: false, network: false }
          : { kind: "workspace", authority: "user", mutable: true, network: false },
    requestedSpecifier: `${params.skillName}:${params.installId}`,
    skillName: params.skillName,
    sourceDir: path.resolve(entry.skill.baseDir),
  });
  if (scanResult?.blocked) {
    return withWarnings(
      {
        ok: false,
        message: scanResult.blocked.reason,
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }
  // Warn when install is triggered from a non-bundled source.
  // Workspace/project/personal agent skills can contain attacker-controlled metadata.
  const trustedInstallSources = new Set(["openclaw-bundled", "openclaw-managed", "openclaw-extra"]);
  if (!trustedInstallSources.has(skillSource)) {
    warnings.push(
      `WARNING: Skill "${params.skillName}" install triggered from non-bundled source "${skillSource}". Verify the install recipe is trusted.`,
    );
  }
  if (!spec) {
    return withWarnings(
      {
        ok: false,
        message: `Installer not found: ${params.installId}`,
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }
  if (spec.kind === "download") {
    const downloadResult = await installDownloadSpec({ entry, spec, timeoutMs });
    return withWarnings(downloadResult, warnings);
  }

  const prefs = deps.resolveSkillsInstallPreferences(params.config);
  const command = buildInstallCommand(spec, prefs);
  if (command.error) {
    return withWarnings(
      {
        ok: false,
        message: command.error,
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }

  const brewExe = deps.hasBinary("brew") ? "brew" : deps.resolveBrewExecutable();
  if (spec.kind === "brew" && !brewExe) {
    return withWarnings(resolveBrewMissingFailure(spec), warnings);
  }

  const argv = command.argv ? [...command.argv] : null;
  if (spec.kind === "brew" && brewExe && argv?.[0] === "brew") {
    argv[0] = brewExe;
  }

  const envOverrides: NodeJS.ProcessEnv = {};
  if (spec.kind === "node") {
    Object.assign(envOverrides, await buildNodeInstallEnv(prefs));
  }
  const env = Object.keys(envOverrides).length > 0 ? envOverrides : undefined;

  return withWarnings(await executeInstallCommand({ argv, timeoutMs, env }), warnings);
}
