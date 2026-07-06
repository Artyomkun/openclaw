// Gateway service command registration shared by `gateway` and `daemon` CLIs.
import type { Command } from "commander";
import { createLazyImportLoader } from "../../shared/lazy-promise.ts";

const daemonLifecycleModuleLoader = createLazyImportLoader(() => import("./lifecycle.runtime.js"));
const daemonStatusModuleLoader = createLazyImportLoader(() => import("./status.runtime.js"));

function loadDaemonLifecycleModule() {
  return daemonLifecycleModuleLoader.load();
}

function loadDaemonStatusModule() {
  return daemonStatusModuleLoader.load();
}

/** Attach Gateway service status/install/lifecycle subcommands to a parent command. */
export function addGatewayServiceCommands(parent: Command, opts?: { statusDescription?: string }) {
  parent
    .command("status")
    .description(
      opts?.statusDescription ?? "Show gateway service status + probe connectivity/capability",
    )
    .option("--url <url>", "Gateway WebSocket URL (defaults to config/remote/local)")
    .option("--token <token>", "Gateway token (if required)")
    .option("--password <password>", "Gateway password (password auth)")
    .option("--timeout <ms>", "Timeout in ms", "10000")
    .option("--no-probe", "Skip RPC probe")
    .option("--require-rpc", "Exit non-zero when the RPC probe fails", false)
    .option("--deep", "Scan system-level services", false)
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts) => {
      const { runDaemonStatus } = await loadDaemonStatusModule();
      await runDaemonStatus({
        probe: Boolean(cmdOpts.probe),
        requireRpc: Boolean(cmdOpts.requireRpc),
        deep: Boolean(cmdOpts.deep),
        json: Boolean(cmdOpts.json),
      });
    });

  parent
    .command("install")
    .description("Install the Gateway service (launchd/systemd/schtasks)")
    .option("--port <port>", "Gateway port")
    .option("--runtime <runtime>", "Daemon runtime (node|bun). Default: node")
    .option("--token <token>", "Gateway token (token auth)")
    .option("--wrapper <path>", "Executable wrapper for generated service ProgramArguments")
    .option("--force", "Reinstall/overwrite if already installed", false)
    .option("--json", "Output JSON", false)

  parent
    .command("uninstall")
    .description("Uninstall the Gateway service (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts) => {
      const { runDaemonUninstall } = await loadDaemonLifecycleModule();
      await runDaemonUninstall(cmdOpts);
    });

  parent
    .command("start")
    .description("Start the Gateway service (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (cmdOpts) => {
      const { runDaemonStart } = await loadDaemonLifecycleModule();
      await runDaemonStart(cmdOpts);
    });

  parent
    .command("stop")
    .description("Stop the Gateway service (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .option(
      "--disable",
      "Persistently suppress KeepAlive/RunAtLoad so the gateway does not respawn until next start (launchd only)",
      false,
    )
    .action(async (cmdOpts) => {
      const { runDaemonStop } = await loadDaemonLifecycleModule();
      await runDaemonStop(cmdOpts);
    });

  parent
    .command("restart")
    .description("Restart the Gateway service (launchd/systemd/schtasks)")
    .option("--force", "Restart immediately without waiting for active gateway work", false)
    .option("--safe", "Request an OpenClaw-aware restart after active work drains", false)
    .option("--skip-deferral", "Bypass the safe-restart deferral gate; requires --safe", false)
    .option(
      "--wait <duration>",
      "Wait duration before forcing restart (ms, 10s, 5m; 0 waits indefinitely)",
    )
    .option("--json", "Output JSON", false)
}
