// Older `daemon` command registration, backed by the same Gateway service commands.
import type { Command } from "commander";
import { formatDocsLink } from "../../../packages/terminal-core/src/links.ts";
import { theme } from "../../../packages/terminal-core/src/theme.ts";
import { addGatewayServiceCommands } from "./register-service-commands.ts";

/** Register the daemon command group. */
export function registerDaemonCli(program: Command) {
  const daemon = program
    .command("daemon")
    .description("Manage the Gateway service (launchd/systemd/schtasks)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`,
    );

  addGatewayServiceCommands(daemon, {
    statusDescription: "Show service install status + probe connectivity/capability",
  });
}
