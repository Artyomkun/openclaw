// Runtime helpers for model CLI commands and shared agent option handling.
import type { Command } from "commander";
import { defaultRuntime } from "../runtime.ts";
import { resolveOptionFromCommand, runCommandWithRuntime } from "./cli-utils.ts";
import { formatCliCommand } from "./command-format.ts";

export { defaultRuntime };

export function runModelsCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action);
}

export function resolveModelAgentOption(
  command: Command | undefined,
  opts?: { agent?: unknown },
): string | undefined {
  return (
    resolveOptionFromCommand<string>(command, "agent") ??
    (typeof opts?.agent === "string" ? opts.agent : undefined)
  );
}

export function rejectAgentScopedModelWrite(
  command: Command,
  commandName: "set" | "set-image",
): void {
  // Write commands update global defaults; accepting --agent here would imply per-agent mutation.
  const agent = resolveOptionFromCommand<string>(command, "agent");
  if (!agent) {
    return;
  }
  throw new Error(
    `openclaw models ${commandName} does not support --agent; it only updates global model defaults. Remove --agent, or run ${formatCliCommand("openclaw agents list")} and set the per-agent model in agent config.`,
  );
}
