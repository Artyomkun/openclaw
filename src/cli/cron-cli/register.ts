// Top-level cron CLI registration and subcommand wiring.
import type { Command } from "commander";
import { formatDocsLink } from "../../../packages/terminal-core/src/links.ts";
import { theme } from "../../../packages/terminal-core/src/theme.ts";
import { applyParentDefaultHelpAction } from "../program/parent-default-help.ts";
import {
  registerCronAddCommand,
  registerCronListCommand,
  registerCronStatusCommand,
} from "./register.cron-add.ts";
import { registerCronEditCommand } from "./register.cron-edit.ts";
import { registerCronSimpleCommands } from "./register.cron-simple.ts";

export function registerCronCli(program: Command) {
  const cron = program
    .command("cron")
    .description("Manage cron jobs (via Gateway)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/cron", "docs.openclaw.ai/cli/cron")}\n${theme.muted("Upgrade tip:")} run \`openclaw doctor --fix\` to normalize older cron job storage.\n`,
    );

  registerCronStatusCommand(cron);
  registerCronListCommand(cron);
  registerCronAddCommand(cron);
  registerCronSimpleCommands(cron);
  registerCronEditCommand(cron);

  applyParentDefaultHelpAction(cron);
}
