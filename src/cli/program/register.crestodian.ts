// Crestodian command registration: setup/repair assistant entrypoint exposed from the root CLI.
import type { Command } from "commander";
import { theme } from "../../../packages/terminal-core/src/theme.ts";
import { runCrestodian } from "../../crestodian/crestodian.ts";
import { defaultRuntime } from "../../runtime.ts";
import { runCommandWithRuntime } from "../cli-utils.ts";
import { formatHelpExamples } from "../help-format.ts";

/** Register the Crestodian helper command and its one-shot request flags. */
export function registerCrestodianCommand(program: Command) {
  program
    .command("crestodian")
    .description("Open the ring-zero setup and repair helper")
    .option("-m, --message <text>", "Run one Crestodian request")
    .option("--yes", "Approve persistent config writes for this request", false)
    .option("--json", "Output startup overview as JSON", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw", "Start Crestodian."],
          ["openclaw crestodian", "Start Crestodian explicitly."],
          ['openclaw crestodian -m "status"', "Run one status request."],
          [
            'openclaw crestodian -m "set default model openai/gpt-5.2" --yes',
            "Apply a typed config write.",
          ],
        ])}`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await runCrestodian({
          message: opts.message as string | undefined,
          yes: Boolean(opts.yes),
          json: Boolean(opts.json),
        });
      });
    });
}
