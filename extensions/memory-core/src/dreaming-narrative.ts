/**
 * Memory Core - Dreaming Narrative
 * 
 * Real narrative generation through AI subagent.
 * Writes dream diary entries to DREAMS.md.
 * 
 * @module DreamingNarrative
 * 
 * FEATURES:
 * - AI-powered narrative generation
 * - Automatic session management
 * - DREAMS.md file operations
 * - Error handling and logging
 * - Configurable model selection
 * 
 * @example
 * ```typescript
 * await generateAndAppendDreamNarrative({
 *   workspaceDir: '/path/to/workspace',
 *   data: {
 *     phase: 'light',
 *     snippets: ['Memory fragment 1', 'Memory fragment 2'],
 *     themes: ['Theme 1', 'Theme 2']
 *   },
 *   subagent: subagentInstance,
 *   logger: console,
 *   model: 'gpt-4'
 * });
 * ```
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// ========================================================================
// TYPES
// ========================================================================

/**
 * Logger interface for the module.
 */
export type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

/**
 * Narrative generation data.
 */
export type NarrativeData = {
  /** Dream phase: light, rem, or deep */
  phase: "light" | "rem" | "deep";
  /** Memory snippets to weave into the narrative */
  snippets: string[];
  /** Optional recurring themes */
  themes?: string[];
  /** Optional current date for context */
  currentDate?: string;
  /** Optional recent diary entries for continuity */
  recentDiaryEntries?: string[];
};

/**
 * Subagent interface for AI execution.
 */
export type Subagent = {
  /** Start a subagent run */
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
  /** Wait for a subagent run to complete */
  waitForRun: (params: {
    runId: string;
    timeoutMs?: number;
  }) => Promise<{ status: string; error?: string }>;
  /** Get messages from a session */
  getSessionMessages: (params: {
    sessionKey: string;
    limit?: number;
  }) => Promise<{ messages: unknown[] }>;
  /** Delete a session */
  deleteSession: (params: { sessionKey: string }) => Promise<void>;
};

/**
 * Module configuration.
 */
export type NarrativeConfig = {
  /** Timeout for narrative generation in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** Maximum snippets to include in prompt (default: 12) */
  maxSnippets?: number;
  /** Maximum themes to include in prompt (default: 6) */
  maxThemes?: number;
  /** Maximum recent diary entries (default: 3) */
  maxRecentEntries?: number;
};

// ========================================================================
// CONSTANTS
// ========================================================================

/** Marker for dream diary section start */
const START_MARKER = "<!-- openclaw:dreaming:diary:start -->";
/** Marker for dream diary section end */
const END_MARKER = "<!-- openclaw:dreaming:diary:end -->";
/** Dreams file name */
const DREAMS_FILE = "DREAMS.md";
/** Default timeout for narrative generation */
const DEFAULT_TIMEOUT_MS = 60_000;
/** Default max snippets in prompt */
const DEFAULT_MAX_SNIPPETS = 12;
/** Default max themes in prompt */
const DEFAULT_MAX_THEMES = 6;
/** Default max recent diary entries */
const DEFAULT_MAX_RECENT_ENTRIES = 3;

/**
 * System prompt for the AI narrative generator.
 * Defines the voice, tone, and rules for dream diary entries.
 */
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
  '- Never say "I\'m dreaming", "in my dream", "as I dream", or any meta-commentary about dreaming.',
  '- Never mention "AI", "agent", "LLM", "model", "language model", or any technical self-reference.',
  "- Do NOT use markdown headers, bullet points, or any formatting — just flowing prose.",
  "- Keep it between 80-180 words. Quality over quantity.",
  "- Output ONLY the diary entry. No preamble, no sign-off, no commentary.",
].join("\n");

// ========================================================================
// FILE OPERATIONS
// ========================================================================

/**
 * Reads the DREAMS.md file from the workspace.
 * If the file doesn't exist, returns a default template.
 * 
 * @param workspaceDir - Workspace directory path
 * @returns File content as string
 * 
 * @example
 * ```typescript
 * const content = await readDreams('/path/to/workspace');
 * ```
 */
async function readDreams(workspaceDir: string): Promise<string> {
  const filePath = join(workspaceDir, DREAMS_FILE);
  try {
    return await readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return `# Dream Diary\n\n${START_MARKER}\n${END_MARKER}\n`;
    }
    throw error;
  }
}

/**
 * Writes content to the DREAMS.md file.
 * Creates the directory if it doesn't exist.
 * 
 * @param workspaceDir - Workspace directory path
 * @param content - Content to write
 * 
 * @example
 * ```typescript
 * await writeDreams('/path/to/workspace', '# Dream Diary\n\nContent');
 * ```
 */
async function writeDreams(workspaceDir: string, content: string): Promise<void> {
  const filePath = join(workspaceDir, DREAMS_FILE);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

// ========================================================================
// PROMPT BUILDING
// ========================================================================

/**
 * Builds the prompt for the AI narrative generator.
 * 
 * @param data - Narrative data
 * @param config - Module configuration
 * @returns Prompt string
 * 
 * @example
 * ```typescript
 * const prompt = buildPrompt({
 *   phase: 'light',
 *   snippets: ['Fragment 1', 'Fragment 2'],
 *   themes: ['Theme 1']
 * });
 * ```
 */
function buildPrompt(data: NarrativeData, config: NarrativeConfig = {}): string {
  const maxSnippets = config.maxSnippets ?? DEFAULT_MAX_SNIPPETS;
  const maxThemes = config.maxThemes ?? DEFAULT_MAX_THEMES;
  const maxRecentEntries = config.maxRecentEntries ?? DEFAULT_MAX_RECENT_ENTRIES;
  
  const lines: string[] = [];
  lines.push("Write a dream diary entry from these memory fragments:\n");

  // Add snippets
  const snippets = data.snippets.slice(0, maxSnippets);
  for (const snippet of snippets) {
    lines.push(`- ${snippet}`);
  }

  // Add themes
  if (data.themes?.length) {
    lines.push("\nRecurring themes:");
    const themes = data.themes.slice(0, maxThemes);
    for (const theme of themes) {
      lines.push(`- ${theme}`);
    }
  }

  // Add date context
  if (data.currentDate) {
    lines.push(`\nCurrent date: ${data.currentDate}`);
  }

  // Add recent diary entries for continuity
  if (data.recentDiaryEntries?.length) {
    lines.push("\nRecent diary entries already written:");
    const entries = data.recentDiaryEntries.slice(0, maxRecentEntries);
    for (const entry of entries) {
      lines.push(`  - ${entry.slice(0, 100)}...`);
    }
    lines.push("- Prefer a fresh angle; do not replay the same first-day framing.");
  }

  return lines.join("\n");
}

// ========================================================================
// NARRATIVE GENERATION
// ========================================================================

/**
 * Generates a narrative through the AI subagent.
 * 
 * @param data - Narrative data
 * @param subagent - Subagent instance for AI execution
 * @param logger - Logger instance
 * @param model - Optional model override
 * @param config - Module configuration
 * @returns Generated narrative text
 * @throws Error if generation fails
 * 
 * @example
 * ```typescript
 * const narrative = await generateNarrative(
 *   data,
 *   subagent,
 *   console,
 *   'gpt-4'
 * );
 * ```
 */
async function generateNarrative(
  data: NarrativeData,
  subagent: Subagent,
  logger: Logger,
  model?: string,
  config: NarrativeConfig = {}
): Promise<string> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sessionKey = `dreaming-narrative-${data.phase}-${Date.now()}`;
  const message = buildPrompt(data, config);

  logger.info(`Starting narrative generation for ${data.phase} phase...`);

  // Start subagent run
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

  // Wait for completion
  const result = await subagent.waitForRun({
    runId: run.runId,
    timeoutMs,
  });

  if (result.status !== "ok") {
    throw new Error(`Narrative generation failed: ${result.error || "unknown error"}`);
  }

  // Extract messages
  const { messages } = await subagent.getSessionMessages({
    sessionKey,
    limit: 5,
  });

  // Extract narrative text from assistant messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role === "assistant" && typeof msg.content === "string") {
      const text = msg.content.trim();
      if (text.length > 0) {
        // Cleanup session
        try {
          await subagent.deleteSession({ sessionKey });
        } catch (cleanupError) {
          // Log cleanup errors but don't fail the main operation
          logger?.warn?.(`Failed to cleanup session: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
        return text;
      }
    }
  }

  throw new Error("No narrative text found in subagent response");
}

// ========================================================================
// DREAMS.MD APPEND
// ========================================================================

/**
 * Formats the current date for the diary entry.
 * 
 * @returns Formatted date string
 * 
 * @example
 * ```typescript
 * const date = formatEntryDate();
 * // Returns: "July 6, 2026 at 3:30 PM"
 * ```
 */
function formatEntryDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Appends a diary entry to DREAMS.md.
 * 
 * @param workspaceDir - Workspace directory
 * @param narrative - Narrative text
 * 
 * @example
 * ```typescript
 * await appendEntry('/path/to/workspace', 'Today I dreamed of...');
 * ```
 */
async function appendEntry(workspaceDir: string, narrative: string): Promise<void> {
  const date = formatEntryDate();
  const entry = `\n---\n\n*${date}*\n\n${narrative}\n`;
  
  let content = await readDreams(workspaceDir);
  
  // Insert entry between markers
  if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
    const endIdx = content.lastIndexOf(END_MARKER);
    content = content.slice(0, endIdx) + entry + content.slice(endIdx);
  } else {
    // Create new diary section if markers don't exist
    content = `# Dream Diary\n\n${START_MARKER}${entry}${END_MARKER}\n`;
  }
  
  await writeDreams(workspaceDir, content);
}

// ========================================================================
// MAIN EXPORT
// ========================================================================

/**
 * Generates and appends a dream narrative to DREAMS.md.
 * 
 * @param params - Function parameters
 * @param params.workspaceDir - Workspace directory
 * @param params.data - Narrative data
 * @param params.subagent - Subagent instance
 * @param params.logger - Logger instance
 * @param params.model - Optional model override
 * @param params.config - Optional module configuration
 * @throws Error if generation fails
 * 
 * @example
 * ```typescript
 * await generateAndAppendDreamNarrative({
 *   workspaceDir: '/path/to/workspace',
 *   data: {
 *     phase: 'light',
 *     snippets: ['Memory fragment 1', 'Memory fragment 2'],
 *     themes: ['Theme 1', 'Theme 2']
 *   },
 *   subagent: subagentInstance,
 *   logger: console,
 *   model: 'gpt-4',
 *   config: { timeoutMs: 30000 }
 * });
 * ```
 */
export async function generateAndAppendDreamNarrative(params: {
  workspaceDir: string;
  data: NarrativeData;
  subagent: Subagent;
  logger: Logger;
  model?: string;
  config?: NarrativeConfig;
}): Promise<void> {
  const { workspaceDir, data, subagent, logger, model, config } = params;
  
  // Validate input
  if (data.snippets.length === 0) {
    logger.info("No snippets for narrative, skipping generation");
    return;
  }

  try {
    // Generate narrative
    logger.info(`Generating ${data.phase} narrative...`);
    const narrative = await generateNarrative(
      data,
      subagent,
      logger,
      model,
      config
    );
    
    // Validate output
    if (!narrative || narrative.length < 20) {
      throw new Error("Generated narrative is too short or empty");
    }
    
    // Append to DREAMS.md
    await appendEntry(workspaceDir, narrative);
    
    logger.info(`✅ Dream diary entry written for ${data.phase} phase`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Failed to generate narrative: ${message}`);
    throw error;
  }
}

// ========================================================================
// EXPORTS
// ========================================================================

export default {
  generateAndAppendDreamNarrative,
};