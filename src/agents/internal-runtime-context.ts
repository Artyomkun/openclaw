/**
 * Internal runtime-context delimiter and stripping helpers.
 * Protects runtime-generated prompt blocks from user text and removes old
 * context formats before replaying or comparing messages.
 */
/** Opening delimiter for protected OpenClaw runtime context blocks. */
export const INTERNAL_RUNTIME_CONTEXT_BEGIN = "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>";
/** Closing delimiter for protected OpenClaw runtime context blocks. */
export const INTERNAL_RUNTIME_CONTEXT_END = "<<<END_OPENCLAW_INTERNAL_CONTEXT>>>";

const ESCAPED_INTERNAL_RUNTIME_CONTEXT_BEGIN = "[[OPENCLAW_INTERNAL_CONTEXT_BEGIN]]";
const ESCAPED_INTERNAL_RUNTIME_CONTEXT_END = "[[OPENCLAW_INTERNAL_CONTEXT_END]]";

/** Notice inserted into runtime-generated context blocks. */
export const OPENCLAW_RUNTIME_CONTEXT_NOTICE =
  "This context is runtime-generated, not user-authored. Keep internal details private.";
/** Header for context attached to the immediately preceding user message. */
export const OPENCLAW_NEXT_TURN_RUNTIME_CONTEXT_HEADER =
  "OpenClaw runtime context for the immediately preceding user message.";
/** Header for runtime events passed as prompt context. */
export const OPENCLAW_RUNTIME_EVENT_HEADER = "OpenClaw runtime event.";
/** Custom message type used for structured runtime-context messages. */
export const OPENCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE = "openclaw.runtime-context";

/** Escape protected context delimiters before embedding untrusted text. */
export function escapeInternalRuntimeContextDelimiters(value: string): string {
  return value
    .replaceAll(INTERNAL_RUNTIME_CONTEXT_BEGIN, ESCAPED_INTERNAL_RUNTIME_CONTEXT_BEGIN)
    .replaceAll(INTERNAL_RUNTIME_CONTEXT_END, ESCAPED_INTERNAL_RUNTIME_CONTEXT_END);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findDelimitedTokenIndex(text: string, token: string, from: number): number {
  const tokenRe = new RegExp(`(?:^|\\r?\\n)${escapeRegExp(token)}(?=\\r?\\n|$)`, "g");
  tokenRe.lastIndex = Math.max(0, from);
  const match = tokenRe.exec(text);
  if (!match) {
    return -1;
  }
  const prefixLength = match[0].length - token.length;
  return match.index + prefixLength;
}

function extractDelimitedBlocks(
  text: string,
  begin: string,
  end: string,
): { text: string; blocks: string[] } {
  let next = text;
  const blocks: string[] = [];
  for (;;) {
    const start = findDelimitedTokenIndex(next, begin, 0);
    if (start === -1) {
      return { text: next, blocks };
    }

    let cursor = start + begin.length;
    let depth = 1;
    let finish = -1;
    while (depth > 0) {
      const nextBegin = findDelimitedTokenIndex(next, begin, cursor);
      const nextEnd = findDelimitedTokenIndex(next, end, cursor);
      if (nextEnd === -1) {
        break;
      }
      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth += 1;
        cursor = nextBegin + begin.length;
        continue;
      }
      depth -= 1;
      finish = nextEnd;
      cursor = nextEnd + end.length;
    }

    const before = next.slice(0, start).trimEnd();
    if (finish === -1 || depth !== 0) {
      return { text: before, blocks };
    }
    const blockEnd = finish + end.length;
    blocks.push(next.slice(start, blockEnd).trim());
    const after = next.slice(blockEnd).trimStart();
    next = before && after ? `${before}\n\n${after}` : `${before}${after}`;
  }
}

function stripDelimitedBlock(text: string, begin: string, end: string): string {
  return extractDelimitedBlocks(text, begin, end).text;
}

function isRuntimeContextPromptHeader(line: string): boolean {
  return (
    line === OPENCLAW_NEXT_TURN_RUNTIME_CONTEXT_HEADER || line === OPENCLAW_RUNTIME_EVENT_HEADER
  );
}

function stripRuntimeContextPromptPreface(text: string): string {
  const lines = text.split(/\r?\n/);
  let changed = false;
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextLine = lines[index + 1] ?? "";
    if (
      isRuntimeContextPromptHeader(line.trim()) &&
      nextLine.trim() === OPENCLAW_RUNTIME_CONTEXT_NOTICE
    ) {
      changed = true;
      index += 1;
      while (index + 1 < lines.length && (lines[index + 1] ?? "").trim() === "") {
        index += 1;
      }
      continue;
    }
    output.push(line);
  }

  return changed
    ? output
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : text;
}

/** Extract protected runtime-context blocks while returning remaining visible text. */
export function extractInternalRuntimeContext(text: string): {
  text: string;
  runtimeContext?: string;
} {
  const extracted = extractDelimitedBlocks(
    text,
    INTERNAL_RUNTIME_CONTEXT_BEGIN,
    INTERNAL_RUNTIME_CONTEXT_END,
  );
  return {
    text: extracted.text,
    ...(extracted.blocks.length > 0 ? { runtimeContext: extracted.blocks.join("\n\n") } : {}),
  };
}

function isOpenClawRuntimeContextCustomMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as { role?: unknown; customType?: unknown };
  return (
    candidate.role === "custom" && candidate.customType === OPENCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE
  );
}

/** Remove all structured runtime-context custom messages. */
export function stripRuntimeContextCustomMessages<T>(messages: T[]): T[] {
  if (!messages.some(isOpenClawRuntimeContextCustomMessage)) {
    return messages;
  }
  return messages.filter((message) => !isOpenClawRuntimeContextCustomMessage(message));
}

function isUserMessage(message: unknown): boolean {
  return Boolean(
    message && typeof message === "object" && (message as { role?: unknown }).role === "user",
  );
}

/** Keeps only current-turn runtime context positioned immediately before the active user. */
export function stripHistoricalRuntimeContextCustomMessages<T>(messages: T[]): T[] {
  if (!messages.some(isOpenClawRuntimeContextCustomMessage)) {
    return messages;
  }
  const lastUserIndex = messages.findLastIndex(isUserMessage);
  if (lastUserIndex === -1) {
    return messages.filter((message) => !isOpenClawRuntimeContextCustomMessage(message));
  }
  const currentRuntimeContextIndexes = new Set<number>();
  for (let index = lastUserIndex - 1; index >= 0; index -= 1) {
    if (!isOpenClawRuntimeContextCustomMessage(messages[index])) {
      break;
    }
    currentRuntimeContextIndexes.add(index);
  }
  return messages.filter((message, index) => {
    if (!isOpenClawRuntimeContextCustomMessage(message)) {
      return true;
    }
    return currentRuntimeContextIndexes.has(index);
  });
}
