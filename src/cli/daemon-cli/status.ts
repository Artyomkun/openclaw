// Gateway service status command entrypoint: gathers status, prints it, and handles probe failures.
import { colorize, isRich, theme } from "../../../packages/terminal-core/src/theme.ts";
import { defaultRuntime } from "../../runtime.ts";
import { gatherDaemonStatus } from "./status.gather.ts";
import { printDaemonStatus } from "./status.print.ts";
import type { DaemonStatusOptions } from "./types.ts";

/** Run Gateway status diagnostics and apply --require-rpc exit behavior. */
export async function runDaemonStatus(opts: DaemonStatusOptions) {
  try {
    if (opts.requireRpc && !opts.probe) {
      defaultRuntime.error(
        "Gateway status failed: --require-rpc needs probing enabled. Remove --no-probe or drop --require-rpc.",
      );
      defaultRuntime.exit(1);
      return;
    }
    const status = await gatherDaemonStatus({
      rpc: opts.rpc,
      probe: opts.probe,
      requireRpc: opts.requireRpc,
      deep: opts.deep === true,
    });
    printDaemonStatus(status, { json: opts.json, deep: opts.deep === true });
    if (opts.requireRpc && !status.rpc?.ok) {
      defaultRuntime.exit(1);
    }
  } catch (err) {
    const rich = isRich();
    defaultRuntime.error(colorize(rich, theme.error, `Gateway status failed: ${String(err)}`));
    defaultRuntime.exit(1);
  }
}
