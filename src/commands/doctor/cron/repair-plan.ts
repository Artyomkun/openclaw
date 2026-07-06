// Cron doctor repair planning helpers for previewing.

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatJobNameList(names: string[]): string {
  const preview = names.slice(0, 5).map((name) => `\`${name}\``);
  const remaining = names.length - preview.length;
  return remaining > 0 ? `: ${preview.join(", ")} (+${remaining} more)` : `: ${preview.join(", ")}`;
}

/**
 * Advisory for isolated agentTurn cron jobs that describe a command but cannot access shell tools.
 * These need operator attention, but `doctor --fix` cannot safely infer whether to grant tool
 * access or recreate them as command cron jobs.
 */
export function formatUnresolvedCommandPromptAdvisory(names: string[]): string | null {
  if (names.length === 0) {
    return null;
  }
  const describeVerb = names.length === 1 ? "describes" : "describe";
  const accessVerb = names.length === 1 ? "lacks" : "lack";
  return [
    `${pluralize(names.length, "isolated cron job")} ${describeVerb} a shell command in the agent prompt but ${accessVerb} shell/process tool access${formatJobNameList(names)}.`,
    "- This is not the supported shell-tool prompt shape, so doctor cannot prove the job will execute the requested command.",
    '- Recreate the job as a command cron job (`openclaw cron add ... --command "<shell>"`) or grant explicit shell/process tool access before relying on it.',
  ].join("\n");
}

/**
 * Advisory for isolated agentTurn cron jobs that drive shell/process tools from the prompt.
 */
export function formatUnresolvedShellPromptAdvisory(names: string[]): string | null {
  if (names.length === 0) {
    return null;
  }
  const verb = names.length === 1 ? "drives" : "drive";
  const keepVerb = names.length === 1 ? "keeps" : "keep";
  return [
    `${pluralize(names.length, "isolated cron job")} ${verb} shell/process tools from the agent prompt and ${keepVerb} running as-is${formatJobNameList(names)}.`,
    '- For a deterministic run, recreate the job as a command cron job (`openclaw cron add ... --command "<shell>"`).',
  ].join("\n");
}