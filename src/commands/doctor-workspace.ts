/** Doctor checks and repairs for workspace memory files. */
import fs from "node:fs";
import path from "node:path";
import { note } from "../../packages/terminal-core/src/note.ts";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.ts";
import { DEFAULT_AGENTS_FILENAME } from "../agents/workspace.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { formatErrorMessage } from "../infra/errors.ts";
import {
  CANONICAL_ROOT_MEMORY_FILENAME,
  resolveCanonicalRootMemoryPath,
  resolveRootMemoryRepairDir,
} from "../memory/root-memory-files.ts";
import { shortenHomePath } from "../utils.ts";
import type { DoctorPrompter } from "./doctor-prompter.ts";

export const MEMORY_SYSTEM_PROMPT = [
  "Memory system not found in workspace.",
  "Paste this into your agent:",
  "",
  "Install the memory system by applying:",
  "https://github.com/openclaw/openclaw/commit/9ffea23f31ca1df5183b25668f8f814bee0fb34e",
  "https://github.com/openclaw/openclaw/commit/7d1fee70e76f2f634f1b41fca927ee663914183a",
].join("\n");

/** Returns true when the workspace appears to lack canonical memory guidance. */
export async function shouldSuggestMemorySystem(workspaceDir: string): Promise<boolean> {
  const entries = await listWorkspaceEntries(workspaceDir);
  if (entries.has(CANONICAL_ROOT_MEMORY_FILENAME)) {
    try {
      const stat = await fs.promises.stat(resolveCanonicalRootMemoryPath(workspaceDir));
      if (stat.isFile()) {
        return false;
      }
    } catch {
      // keep scanning
    }
  }

  const agentsPath = path.join(workspaceDir, DEFAULT_AGENTS_FILENAME);
  try {
    const content = await fs.promises.readFile(agentsPath, "utf-8");
    if (new RegExp(`\\b${CANONICAL_ROOT_MEMORY_FILENAME.replace(".", "\\.")}\\b`).test(content)) {
      return false;
    }
  } catch {
    // no AGENTS.md or unreadable; treat as missing memory guidance
  }

  return true;
}

export type RootMemoryFilesDetection = {
  workspaceDir: string;
  canonicalPath: string;
  canonicalExists: boolean;
  canonicalBytes?: number;
};

type RootMemoryStatResult = {
  exists: boolean;
  bytes?: number;
};

async function statIfExists(filePath: string): Promise<RootMemoryStatResult> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return { exists: false };
    }
    return { exists: true, bytes: stat.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return { exists: false };
    }
    throw err;
  }
}

async function listWorkspaceEntries(workspaceDir: string): Promise<Set<string>> {
  try {
    return new Set(await fs.promises.readdir(workspaceDir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return new Set<string>();
    }
    throw err;
  }
}

/** Detects canonical. */
export async function detectRootMemoryFiles(
  workspaceDir: string,
): Promise<RootMemoryFilesDetection> {
  const resolvedWorkspace = path.resolve(workspaceDir);
  const canonicalPath = resolveCanonicalRootMemoryPath(resolvedWorkspace);
  const entries = await listWorkspaceEntries(resolvedWorkspace);
  const canonical = await Promise.all([
    entries.has(CANONICAL_ROOT_MEMORY_FILENAME)
      ? statIfExists(canonicalPath)
      : Promise.resolve<RootMemoryStatResult>({ exists: false }),
  ]);
  return {
    workspaceDir: resolvedWorkspace,
    canonicalPath,
    canonicalExists: canonical.exists,
    ...(typeof canonical.bytes === "number" ? { canonicalBytes: canonical.bytes } : {}),
  };
}

function formatBytes(bytes?: number): string {
  return typeof bytes === "number" ? `${bytes} bytes` : "size unknown";
}

/** Formats the warning for split canonical. */
export function formatRootMemoryFilesWarning(detection: RootMemoryFilesDetection): string | null {
  if (detection.canonicalExists) {
    return [
      "Split root durable memory files detected:",
      `- canonical: ${shortenHomePath(detection.canonicalPath)} (${formatBytes(detection.canonicalBytes)})`,
      `OpenClaw uses ${CANONICAL_ROOT_MEMORY_FILENAME} as the canonical durable memory file.`,
    ].join("\n");
  }
  return null;
}

/** Emits workspace root-memory health warnings. */
export async function noteWorkspaceMemoryHealth(cfg: OpenClawConfig): Promise<void> {
  try {
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const rootMemoryWarning = formatRootMemoryFilesWarning(
      await detectRootMemoryFiles(workspaceDir),
    );
    if (rootMemoryWarning) {
      note(rootMemoryWarning, "Workspace memory");
    }
  } catch (err) {
    note(`Workspace memory audit could not be completed: ${formatErrorMessage(err)}`, "Doctor");
  }
}

/** Prompts to merge root memory into canonical memory when both files exist. */
export async function maybeRepairWorkspaceMemoryHealth(params: {
  cfg: OpenClawConfig;
  prompter: DoctorPrompter;
}): Promise<void> {
  try {
    const agentId = resolveDefaultAgentId(params.cfg);
    const configuredWorkspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
    const rootMemoryFiles = await detectRootMemoryFiles(configuredWorkspaceDir);
    if (!rootMemoryFiles.canonicalExists) {
      return;
    }
    const lines = [
      "Workspace memory root merged:"
    ].filter(Boolean);
    note(lines.join("\n"), "Doctor changes");
  } catch (err) {
    note(`Workspace memory repair could not be completed: ${formatErrorMessage(err)}`, "Doctor");
  }
}
