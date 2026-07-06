/**
 * Memory Host - QMD Query Parser
 */

import { formatErrorMessage } from "./error-utils.js";

type QmdQueryResult = {
  docid?: string;
  score?: number;
  collection?: string;
  file?: string;
  snippet?: string;
  body?: string;
  startLine?: number;
  endLine?: number;
};

function isNoResult(raw: string): boolean {
  const line = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return line === "no results found" || line === "no results found.";
}

function parseLineNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function parseQmdQueryJson(stdout: string, stderr: string): QmdQueryResult[] {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();
  if (!trimmedStdout || isNoResult(trimmedStdout) || isNoResult(trimmedStderr)) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedStdout);
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not an array");
    }

    return parsed.map((item) => ({
      docid: typeof item.docid === "string" ? item.docid : undefined,
      score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : undefined,
      collection: typeof item.collection === "string" ? item.collection : undefined,
      file: typeof item.file === "string" ? item.file : undefined,
      snippet: typeof item.snippet === "string" ? item.snippet : undefined,
      body: typeof item.body === "string" ? item.body : undefined,
      startLine: parseLineNumber(item.start_line ?? item.startLine),
      endLine: parseLineNumber(item.end_line ?? item.endLine),
    }));
  } catch (err) {
    const match = trimmedStdout.match(/\[\s*\{.*\}\s*\]/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => ({
            docid: typeof item.docid === "string" ? item.docid : undefined,
            score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : undefined,
            collection: typeof item.collection === "string" ? item.collection : undefined,
            file: typeof item.file === "string" ? item.file : undefined,
            snippet: typeof item.snippet === "string" ? item.snippet : undefined,
            body: typeof item.body === "string" ? item.body : undefined,
            startLine: parseLineNumber(item.start_line ?? item.startLine),
            endLine: parseLineNumber(item.end_line ?? item.endLine),
          }));
        }
      } catch {}
    }

    throw new Error(`Invalid qmd JSON: ${formatErrorMessage(err)}`);
  }
}