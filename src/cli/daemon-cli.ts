// Public daemon CLI barrel retained for gateway service command compatibility.
export { registerDaemonCli } from "./daemon-cli/register.ts";
export { addGatewayServiceCommands } from "./daemon-cli/register-service-commands.ts";
export {
  runDaemonInstall,
  runDaemonRestart,
  runDaemonStart,
  runDaemonStatus,
  runDaemonStop,
  runDaemonUninstall,
} from "./daemon-cli/runners.ts";
export type {
  DaemonInstallOptions,
  DaemonStatusOptions,
  GatewayRpcOpts,
} from "./daemon-cli/types.ts";
