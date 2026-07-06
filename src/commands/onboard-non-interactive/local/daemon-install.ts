/**
 * Non-interactive gateway daemon installation for local onboarding.
 *
 * It validates daemon runtime options, resolves gateway auth inputs, and then
 * delegates the platform-specific service install.
 */
import type { OpenClawConfig } from "../../../config/types.openclaw.ts";
import { resolveGatewayService } from "../../../daemon/service.ts";
import { isSystemdUserServiceAvailable } from "../../../daemon/systemd.ts";
import { formatErrorMessage } from "../../../infra/errors.ts";
import type { RuntimeEnv } from "../../../runtime.ts";
import { buildGatewayInstallPlan, gatewayInstallErrorHint } from "../../daemon-install-helpers.ts";
import { DEFAULT_GATEWAY_DAEMON_RUNTIME, isGatewayDaemonRuntime } from "../../daemon-runtime.ts";
import { resolveGatewayInstallToken } from "../../gateway-install-token.ts";
import type { OnboardOptions } from "../../onboard-types.ts";
import { ensureSystemdUserLingerNonInteractive } from "../../systemd-linger.ts";

/** Installs the managed gateway daemon when non-interactive setup requested it. */
export async function installGatewayDaemonNonInteractive(params: {
  nextConfig: OpenClawConfig;
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  port: number;
}): Promise<
  | {
      installed: true;
    }
  | {
      installed: false;
      skippedReason?: "systemd-user-unavailable";
    }
> {
  const { opts, runtime, port } = params;
  if (!opts.installDaemon) {
    return { installed: false };
  }

  const daemonRuntimeRaw = opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
  const systemdAvailable =
    process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
  if (process.platform === "linux" && !systemdAvailable) {
    // Container and CI sessions often lack a user systemd manager; setup can
    // still succeed with a direct gateway run, so this is a skip not a fatal.
    runtime.log(
      "Systemd user services are unavailable; skipping service install. Use a direct shell run (`openclaw gateway run`) or rerun without --install-daemon on this session.",
    );
    return { installed: false, skippedReason: "systemd-user-unavailable" };
  }

  if (!isGatewayDaemonRuntime(daemonRuntimeRaw)) {
    runtime.error('Invalid --daemon-runtime. Use "node" or "bun".');
    runtime.exit(1);
    return { installed: false };
  }

  const service = resolveGatewayService();
  const tokenResolution = await resolveGatewayInstallToken({
    config: params.nextConfig,
    env: process.env,
  });
  for (const warning of tokenResolution.warnings) {
    runtime.log(warning);
  }
  if (tokenResolution.unavailableReason) {
    // Installing a daemon without durable gateway auth creates a service that
    // cannot be reached by paired clients after setup exits.
    runtime.error(
      [
        "Gateway install blocked:",
        tokenResolution.unavailableReason,
        "Fix gateway auth config/token input and rerun setup.",
      ].join(" "),
    );
    runtime.exit(1);
    return { installed: false };
  }
  const { programArguments, workingDirectory, environment, environmentValueSources } =
    await buildGatewayInstallPlan({
      env: process.env,
      port,
      runtime: daemonRuntimeRaw,
      warn: (message) => runtime.log(message),
      config: params.nextConfig,
    });
  try {
    await service.install({
      env: process.env,
      stdout: process.stdout,
      programArguments,
      workingDirectory,
      environment,
      environmentValueSources,
    });
  } catch (err) {
    runtime.error(`Gateway service install failed: ${formatErrorMessage(err)}`);
    runtime.log(gatewayInstallErrorHint());
    return { installed: false };
  }
  await ensureSystemdUserLingerNonInteractive({ runtime });
  return { installed: true };
}
