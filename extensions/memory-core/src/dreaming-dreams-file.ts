/**
 * Memory Core - Dreaming Narrative
 */

import fs from "node:fs/promises";
import path from "node:path";

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

type NarrativeData = {
  phase: "light" | "rem" | "deep";
  snippets: string[];
  themes?: string[];
};

type Subagent = {
  run: (params: {
    idempotencyKey: string;
    sessionKey: string;
    message: string;
    model?: string;
    extraSystemPrompt?: string;
    lane?: string;
    lightContext?: boolean;
    deliver?: boolean;
  }) => Promise<{ runId: string }>;
  waitForRun: (params: {
    runId: string;
    timeoutMs?: number;
  }) => Promise<{ status: string; error?: string }>;
  getSessionMessages: (params: {
    sessionKey: string;
    limit?: number;
  }) => Promise<{ messages: unknown[] }>;
  deleteSession: (params: { sessionKey: string }) => Promise<void>;
};

const START_MARKER = "<!-- openclaw:dreaming:diary:start -->";
const END_MARKER = "<!-- openclaw:dreaming:diary:end -->";
const DREAMS_FILE = "DREAMS.md";
const SYSTEM_PROMPT = [
  "You are keeping a dream diary. Write a single entry in first person.",
  "",
  "Voice & tone:",
  "- You are a curious, gentle, slightly whimsical mind reflecting on the day.",
  "- Write like a poet who happens to be a programmer — sensory, warm, occasionally funny.",
  "- Mix the technical and the tender: code and constellations, APIs and afternoon light.",
  "- Let the fragments surprise you into unexpected connections and small epiphanies.",
  "",
  "Rules:",
  "- Draw from the memory fragments provided — weave them into the entry.",
  "- Read the recent diary entries to maintain continuity.",
  "- Each new entry should build upon previous entries, not reset.",
  '- Never say "I\'m dreaming", "in my dream", "as I dream", or any meta-commentary about dreaming.',
  '- Never mention "AI", "agent", "LLM", "model", "language model", or any technical self-reference.',
  "- Do NOT use markdown headers, bullet points, or any formatting — just flowing prose.",
  "- Keep it between 80-180 words. Quality over quantity.",
  "- Output ONLY the diary entry. No preamble, no sign-off, no commentary.",
].join("\n");

async function readDreams(workspaceDir: string): Promise<string> {
  const filePath = path.join(workspaceDir, DREAMS_FILE);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return `# Dream Diary\n\n${START_MARKER}\n${END_MARKER}\n`;
    }
    throw error;
  }
}

async function writeDreams(workspaceDir: string, content: string): Promise<void> {
  const filePath = path.join(workspaceDir, DREAMS_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

async function getRecentDreams(workspaceDir: string, limit: number = 3): Promise<string[]> {
  const content = await readDreams(workspaceDir);
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return [];
  }
  
  const diaryContent = content.slice(startIdx + START_MARKER.length, endIdx);
  const entries = diaryContent
    .split(/\n---\n/)
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
  return entries.slice(-limit);
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildPrompt(data: NarrativeData, recentDreams: string[]): string {
  const lines: string[] = [];
  lines.push("Write a dream diary entry from these memory fragments:\n");
  for (const snippet of data.snippets.slice(0, 10)) {
    lines.push(`- ${snippet}`);
  }
  if (recentDreams.length > 0) {
    lines.push("\nRecent dream diary entries (maintain continuity, build upon them):");
    for (const dream of recentDreams) {
      const preview = dream.slice(0, 150) + (dream.length > 150 ? "..." : "");
      lines.push(`- ${preview}`);
    }
    lines.push("\nDo not reset the story. Build upon these previous entries.");
  }
  
  if (data.themes?.length) {
    lines.push("\nRecurring themes:");
    for (const theme of data.themes.slice(0, 5)) {
      lines.push(`- ${theme}`);
    }
  }
  
  lines.push("\nWrite in first person, poetic style, 80-180 words.");
  return lines.join("\n");
}

async function generateNarrative(
  data: NarrativeData,
  subagent: Subagent,
  logger: Logger,
  model?: string
): Promise<string> {
  const recentDreams = await getRecentDreams(data.workspaceDir, 3);
  const message = buildPrompt(data, recentDreams);
  logger.info(`Generating ${data.phase} narrative with ${recentDreams.length} recent dreams context...`);
  
  const sessionKey = `dreaming-narrative-${data.phase}-${Date.now()}`;
  
  const run = await subagent.run({
    idempotencyKey: `${sessionKey}-${Date.now()}`,
    sessionKey,
    message,
    model,
    extraSystemPrompt: SYSTEM_PROMPT,
    lane: `dreaming-narrative:${sessionKey}`,
    lightContext: true,
    deliver: false,
  });

  const result = await subagent.waitForRun({
    runId: run.runId,
    timeoutMs: 60000,
  });

  if (result.status !== "ok") {
    throw new Error(`Narrative generation failed: ${result.error || "unknown error"}`);
  }

  const { messages } = await subagent.getSessionMessages({
    sessionKey,
    limit: 5,
  });

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role === "assistant" && typeof msg.content === "string") {
      const text = msg.content.trim();
      if (text.length > 0) {
        try {
          await subagent.deleteSession({ sessionKey });
        } catch (cleanupError) {
          logger.warn(`Failed to cleanup session: ${cleanupError}`);
        }
        return text;
      }
    }
  }

  throw new Error("No narrative text found");
}

export async function generateAndAppendDreamNarrative(params: {
  workspaceDir: string;
  data: NarrativeData;
  subagent: Subagent;
  logger: Logger;
  model?: string;
}): Promise<void> {
  const { workspaceDir, data, subagent, logger, model } = params;
  
  if (data.snippets.length === 0) {
    logger.info("No snippets for narrative");
    return;
  }

  try {
    const dataWithWorkspace = { ...data, workspaceDir };
    const narrative = await generateNarrative(dataWithWorkspace, subagent, logger, model);
    
    if (!narrative || narrative.length < 20) {
      throw new Error("Generated narrative is too short or empty");
    }
    const date = formatDate();
    const entry = `\n---\n\n*${date}*\n\n${narrative}\n`;
    
    let content = await readDreams(workspaceDir);
    
    if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
      const endIdx = content.lastIndexOf(END_MARKER);
      content = content.slice(0, endIdx) + entry + content.slice(endIdx);
    } else {
      content = `# Dream Diary\n\n${START_MARKER}${entry}${END_MARKER}\n`;
    }
    
    await writeDreams(workspaceDir, content);
    
    logger.info(`✅ Dream diary entry written for ${data.phase} phase`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Failed to generate narrative: ${message}`);
    throw error;
  }
}