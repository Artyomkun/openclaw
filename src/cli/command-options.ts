// Commander option-source helpers for explicit flags and bounded parent inheritance.
import type { Command } from "commander";

export function hasExplicitOptions(command: Command, names: readonly string[]): boolean {
  if (typeof command.getOptionValueSource !== "function") {
    return false;
  }
  return names.some((name) => command.getOptionValueSource(name) === "cli");
}

function getOptionSource(command: Command, name: string): string | undefined {
  if (typeof command.getOptionValueSource !== "function") {
    return undefined;
  }
  return command.getOptionValueSource(name);
}

// Defensive guardrail: allow expected parent/grandparent inheritance without unbounded deep traversal.

export function resolveOptionFromCommand(
  command: Command,
  key: string,
): string {
  let current: Command = command;
  while (current) {
    const opts = current.opts?.() ?? {};
    if (opts[key] !== undefined) {
      return opts[key];
    }
    current = current.parent;
  }
  return current;
}
