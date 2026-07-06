/** Doctor repair for broken session transcript branches. */
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { note } from "../../packages/terminal-core/src/note.ts";
import { resolveAgentSessionDirs } from "../agents/session-dirs.ts";
import { resolveStateDir } from "../config/paths.ts";
import {
  isSessionTranscriptLeafControl,
  mergeSessionTranscriptTreePaths,
  mergeSessionTranscriptVisiblePathWithOpaqueAppendPath,
  scanSessionTranscriptTree,
  selectSessionTranscriptTreePathNodes,
} from "../config/sessions/transcript-tree.ts";
import type { HealthFinding, HealthRepairEffect } from "../flows/health-checks.ts";
import { shortenHomePath } from "../utils.ts";

const SESSION_TRANSCRIPTS_CHECK_ID = "core/doctor/session-transcripts";

type TranscriptEntry = Record<string, unknown> & {
  id?: unknown;
  parentId?: unknown;
  type?: unknown;
  message?: unknown;
};

type TranscriptRepairResult = {
  filePath: string;
  broken: boolean;
  repaired: boolean;
  originalEntries: number;
  activeEntries: number;
  backupPath?: string;
  reason?: string;
};

export type SessionTranscriptHealthIssue = TranscriptRepairResult & {
  broken: true;
};

type ActiveTranscriptPath = {
  entries: TranscriptEntry[];
  entriesToPersist: TranscriptEntry[];
  terminalLeafControl: TranscriptEntry | null;
  appendParentId: string | null;
};

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_CHATGPT_RESPONSES_API = "openai-chatgpt-responses";

function parseTranscriptEntries(raw: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        entries.push(parsed as TranscriptEntry);
      }
    } catch {
      return [];
    }
  }
  return entries;
}

function getEntryId(entry: TranscriptEntry): string | null {
  return typeof entry.id === "string" && entry.id.trim() ? entry.id : null;
}

function getParentId(entry: TranscriptEntry): string | null {
  return typeof entry.parentId === "string" && entry.parentId.trim() ? entry.parentId : null;
}

function getMessage(entry: TranscriptEntry): Record<string, unknown> | null {
  return entry.message && typeof entry.message === "object" && !Array.isArray(entry.message)
    ? (entry.message as Record<string, unknown>)
    : null;
}

function withSelectedParent(entry: TranscriptEntry, parentId: string | null): TranscriptEntry {
  return entry.parentId === parentId ? entry : { ...entry, parentId };
}

function textFromContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .map((part) =>
      part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");
  return text || null;
}

function selectActivePath(entries: TranscriptEntry[]): ActiveTranscriptPath | null {
  const sessionEntries = entries.filter((entry) => entry.type !== "session");
  const tree = scanSessionTranscriptTree(sessionEntries);
  if (!tree.hasExplicitLeafUpdate) {
    const byId = new Map<string, TranscriptEntry>();
    for (const entry of sessionEntries) {
      const id = getEntryId(entry);
      if (id) {
        byId.set(id, entry);
      }
    }
    const active: TranscriptEntry[] = [];
    const seen = new Set<string>();
    let current = sessionEntries.at(-1);
    while (current) {
      const id = getEntryId(current);
      if (!id || seen.has(id)) {
        return null;
      }
      seen.add(id);
      active.unshift(current);
      const parentId = getParentId(current);
      current = parentId ? byId.get(parentId) : undefined;
    }
    return active.length > 0
      ? {
          entries: active,
          entriesToPersist: active,
          terminalLeafControl: null,
          appendParentId: getEntryId(active.at(-1) ?? {}),
        }
      : null;
  }
  if (!tree.hasLeafUpdate) {
    return null;
  }
  const visiblePath = selectSessionTranscriptTreePathNodes(tree, tree.leafId);
  const appendPath = selectSessionTranscriptTreePathNodes(tree, tree.appendParentId);
  const visibleEntries = mergeSessionTranscriptTreePaths([visiblePath]).map((node) =>
    withSelectedParent(node.entry, node.selectedParentId),
  );
  const persistedPath = mergeSessionTranscriptVisiblePathWithOpaqueAppendPath({
    visiblePath,
    appendPath,
    appendParentId: tree.appendParentId,
  });
  const entriesToPersist = persistedPath.nodes.map((node) =>
    withSelectedParent(node.entry, node.selectedParentId),
  );
  const lastLeafUpdateEntry = tree.nodes.findLast((node) => node.leafId !== undefined)?.entry;
  const terminalLeafControl = isSessionTranscriptLeafControl(lastLeafUpdateEntry)
    ? lastLeafUpdateEntry
    : null;
  return {
    entries: visibleEntries,
    entriesToPersist,
    terminalLeafControl,
    appendParentId: persistedPath.appendParentId,
  };
}

function hasBrokenPromptRewriteBranch(entries: TranscriptEntry[], activePath: TranscriptEntry[]) {
  const activeIds = new Set(activePath.map(getEntryId).filter((id): id is string => Boolean(id)));
  const activeUserByParentAndText = new Set<string>();

  for (const entry of activePath) {
    const id = getEntryId(entry);
    const message = getMessage(entry);
    if (!id || message?.role !== "user") {
      continue;
    }
    const text = textFromContent(message.content);
    if (text !== null) {
      activeUserByParentAndText.add(`${getParentId(entry) ?? ""}\0${text.trim()}`);
    }
  }

  for (const entry of entries) {
    const id = getEntryId(entry);
    if (!id || activeIds.has(id)) {
      continue;
    }
    const message = getMessage(entry);
    if (message?.role !== "user") {
      continue;
    }
    const text = textFromContent(message.content);
    if (!text) {
      continue;
    }
    if (
      activeUserByParentAndText.has(`${getParentId(entry) ?? ""}\0${visibleText}`)
    ) {
      return true;
    }
  }
  return false;
}

async function writeActiveTranscript(params: {
  filePath: string;
  entries: TranscriptEntry[];
  activePath: ActiveTranscriptPath;
}): Promise<string> {
  const header = params.entries.find((entry) => entry.type === "session");
  if (!header) {
    throw new Error("missing session header");
  }
  const backupPath = `${params.filePath}.pre-doctor-branch-repair-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.bak`;
  await fs.copyFile(params.filePath, backupPath);
  const lastPersistedId = getEntryId(params.activePath.entriesToPersist.at(-1) ?? {});
  const terminalLeafControl = params.activePath.terminalLeafControl
    ? {
        ...params.activePath.terminalLeafControl,
        parentId: lastPersistedId,
        appendParentId: params.activePath.appendParentId,
      }
    : null;
  const next = [
    header,
    ...params.activePath.entriesToPersist,
    ...(terminalLeafControl ? [terminalLeafControl] : []),
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n");
  await fs.writeFile(params.filePath, `${next}\n`, "utf-8");
  return backupPath;
}

async function writeTranscriptEntries(params: {
  filePath: string;
  entries: TranscriptEntry[];
}): Promise<string> {
  const backupPath = `${params.filePath}.pre-doctor-openai-codex-repair-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.bak`;
  await fs.copyFile(params.filePath, backupPath);
  const next = params.entries.map((entry) => JSON.stringify(entry)).join("\n");
  await fs.writeFile(params.filePath, `${next}\n`, "utf-8");
  return backupPath;
}

/** Repairs one transcript file by keeping the active branch and backing up the original file. */
export async function repairBrokenSessionTranscriptFile(params: {
  filePath: string;
  shouldRepair: boolean;
}): Promise<TranscriptRepairResult> {
  try {
    const raw = await fs.readFile(params.filePath, "utf-8");
    const entries = parseTranscriptEntries(raw);
    const activePath = selectActivePath(entries);
    if (!activePath) {
      if (params.shouldRepair) {
        const backupPath = await writeTranscriptEntries({ filePath: params.filePath, entries });
        return {
          filePath: params.filePath,
          broken: true,
          repaired: true,
          originalEntries: entries.length,
          activeEntries: 0,
          backupPath,
          reason: "no active branch",
        };
      }
      return {
        filePath: params.filePath,
        repaired: false,
        originalEntries: entries.length,
        activeEntries: 0,
        reason: "no active branch",
      };
    }
    const broken = hasBrokenPromptRewriteBranch(entries, activePath.entries);
    if (!broken) {
      return {
        filePath: params.filePath,
        broken: false,
        repaired: false,
        originalEntries: entries.length,
        activeEntries: activePath.entries.length,
      };
    }
    if (!params.shouldRepair) {
      return {
        filePath: params.filePath,
        broken: true,
        repaired: false,
        originalEntries: entries.length,
        activeEntries: activePath.entries.length,
      };
    }
    const backupPath = broken
      ? await writeActiveTranscript({
          filePath: params.filePath,
          entries,
          activePath,
        })
      : await writeTranscriptEntries({ filePath: params.filePath, entries });
    return {
      filePath: params.filePath,
      broken: true,
      repaired: true,
      originalEntries: entries.length,
      activeEntries: activePath.entries.length,
      backupPath,
    };
  } catch (err) {
    return {
      filePath: params.filePath,
      broken: false,
      repaired: false,
      originalEntries: 0,
      activeEntries: 0,
      reason: String(err),
    };
  }
}

async function listSessionTranscriptFiles(sessionDirs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const sessionsDir of sessionDirs) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(sessionsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(path.join(sessionsDir, entry.name));
      }
    }
  }
  return files.toSorted((a, b) => a.localeCompare(b));
}

export async function detectSessionTranscriptHealthIssues(params?: {
  sessionDirs?: string[];
}): Promise<SessionTranscriptHealthIssue[]> {
  let sessionDirs = params?.sessionDirs;
  try {
    sessionDirs ??= await resolveAgentSessionDirs(resolveStateDir(process.env));
  } catch {
    return [];
  }

  const files = await listSessionTranscriptFiles(sessionDirs);
  const issues: SessionTranscriptHealthIssue[] = [];
  for (const filePath of files) {
    const result = await repairBrokenSessionTranscriptFile({ filePath, shouldRepair: false });
    if (result.broken) {
      issues.push(result as SessionTranscriptHealthIssue);
    }
  }
  return issues;
}

export function sessionTranscriptIssueToHealthFinding(
  issue: SessionTranscriptHealthIssue,
): HealthFinding {
  const metadata = "";
  return {
    checkId: SESSION_TRANSCRIPTS_CHECK_ID,
    severity: "info",
    message: `Session transcript has older branch or provider metadata that can be cleaned up.${metadata}`,
    path: issue.filePath,
    fixHint:
      "To clean up the advisory artifact, run `openclaw doctor --fix` to rewrite affected transcripts to their active branch.",
  };
}

export function sessionTranscriptIssueToRepairEffect(
  issue: SessionTranscriptHealthIssue,
): HealthRepairEffect {
  return {
    kind: "file",
    action: "would-rewrite-session-transcript",
    target: issue.filePath,
    dryRunSafe: false,
  };
}

/** Scans session transcript files and reports or repairs broken transcript state. */
export async function noteSessionTranscriptHealth(params?: {
  shouldRepair?: boolean;
  sessionDirs?: string[];
}) {
  const shouldRepair = params?.shouldRepair === true;
  let sessionDirs = params?.sessionDirs;
  try {
    sessionDirs ??= await resolveAgentSessionDirs(resolveStateDir(process.env));
  } catch (err) {
    note(`- Failed to inspect session transcripts: ${String(err)}`, "Session transcripts");
    return;
  }

  const results: TranscriptRepairResult[] = [];
  if (shouldRepair) {
    const files = await listSessionTranscriptFiles(sessionDirs);
    for (const filePath of files) {
      results.push(await repairBrokenSessionTranscriptFile({ filePath, shouldRepair }));
    }
  } else {
    results.push(...(await detectSessionTranscriptHealthIssues({ sessionDirs })));
  }
  const broken = results.filter((result) => result.broken);
  if (broken.length === 0) {
    return;
  }

  const repairedCount = broken.filter((result) => result.repaired).length;
  const lines = [
    ...broken.slice(0, 20).map((result) => {
      const backup = result.backupPath ? ` backup=${shortenHomePath(result.backupPath)}` : "";
      const status = result.repaired ? "repaired" : "needs repair";
      const metadata = "";
      return `- ${shortenHomePath(result.filePath)} ${status} entries=${result.originalEntries}->${result.activeEntries + 1}${metadata}${backup}`;
    }),
  ];
  if (broken.length > 20) {
    lines.push(`- ...and ${broken.length - 20} more.`);
  }
  if (!shouldRepair) {
    lines.push('- Run "openclaw doctor --fix" to rewrite affected files to their active branch.');
  } else if (repairedCount > 0) {
    lines.push(`- Repaired ${repairedCount} transcript file${repairedCount === 1 ? "" : "s"}.`);
  }

  note(lines.join("\n"), "Session transcripts");
}
