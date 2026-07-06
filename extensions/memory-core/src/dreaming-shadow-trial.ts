/**
 * Memory Core - Dreaming Shadow Trial
 * 
 * Просто сохраняет отчёт о теневом испытании.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// ========================================================================
// Типы
// ========================================================================

export type Verdict = "helpful" | "neutral" | "harmful";
export type Recommendation = "promote" | "defer" | "reject";

export interface TrialInput {
  candidate: string;
  trialPrompt: string;
  baselineOutcome: string;
  candidateOutcome: string;
  verdict: Verdict;
  reason: string;
  riskFlags?: string[];
  evidenceRefs?: string[];
  workspaceDir?: string;
  reportPath?: string;
}

// ========================================================================
// Утилиты
// ========================================================================

function getRec(verdict: Verdict): Recommendation {
  if (verdict === "helpful") return "promote";
  if (verdict === "harmful") return "reject";
  return "defer";
}

function getReportPath(input: TrialInput): string {
  if (input.reportPath) return input.reportPath;
  if (!input.workspaceDir) throw new Error("workspaceDir required");
  
  const hash = crypto.createHash("sha256")
    .update(JSON.stringify({ candidate: input.candidate, prompt: input.trialPrompt }))
    .digest("hex")
    .slice(0, 12);
  
  return path.join(input.workspaceDir, "memory", "dreaming", "shadow-trials", `${hash}.md`);
}

// ========================================================================
// Основная функция
// ========================================================================

export async function writeDreamingShadowTrialReport(input: TrialInput): Promise<void> {
  const { candidate, trialPrompt, baselineOutcome, candidateOutcome, verdict, reason } = input;
  const riskFlags = input.riskFlags || [];
  const evidenceRefs = input.evidenceRefs || [];
  const rec = getRec(verdict);
  const reportPath = getReportPath(input);

  const markdown = [
    "# Dreaming Shadow Trial Report",
    "",
    `**candidate:** ${candidate}`,
    `**trial prompt:** ${trialPrompt}`,
    `**baseline outcome:** ${baselineOutcome}`,
    `**candidate outcome:** ${candidateOutcome}`,
    `**verdict:** ${verdict}`,
    `**recommendation:** ${rec}`,
    `**reason:** ${reason}`,
    `**risk flags:** ${riskFlags.length ? riskFlags.join(", ") : "none"}`,
    `**evidence refs:** ${evidenceRefs.length ? evidenceRefs.join(", ") : "none"}`,
  ].join("\n");

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, markdown, "utf-8");
}