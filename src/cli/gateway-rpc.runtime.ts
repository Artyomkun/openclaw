// Runtime gateway RPC helper shared by CLI commands that call the Gateway.
import {
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
} from "../../packages/gateway-protocol/src/client-info.ts";
import { callGateway } from "../gateway/call.ts";
import type { GatewayRpcOpts } from "./gateway-rpc.types.ts";
import { parseTimeoutMsWithFallback } from "./parse-timeout.ts";
import { withProgress } from "./progress.ts";

type CallGatewayFromCliRuntimeExtra = {
  clientName?: Parameters<typeof callGateway>[0]["clientName"];
  mode?: Parameters<typeof callGateway>[0]["mode"];
  deviceIdentity?: Parameters<typeof callGateway>[0]["deviceIdentity"];
  expectFinal?: boolean;
  progress?: boolean;
  scopes?: Parameters<typeof callGateway>[0]["scopes"];
};

const DEFAULT_GATEWAY_RPC_TIMEOUT_MS = 30_000;

export async function callGatewayFromCliRuntime(
  method: string,
  opts: GatewayRpcOpts,
  params?: unknown,
  extra?: CallGatewayFromCliRuntimeExtra,
) {
  // Progress is disabled for JSON output so stdout stays parseable.
  const showProgress = extra?.progress ?? opts.json !== true;
  const timeoutMs = parseTimeoutMsWithFallback(opts.timeout, DEFAULT_GATEWAY_RPC_TIMEOUT_MS, {
    invalidType: "error",
  });
  return await withProgress(
    {
      label: `Gateway ${method}`,
      indeterminate: true,
      enabled: showProgress,
    },
    async () =>
      await callGateway({
        url: opts.url,
        token: opts.token,
        method,
        params,
        deviceIdentity: extra?.deviceIdentity,
        expectFinal: extra?.expectFinal ?? Boolean(opts.expectFinal),
        scopes: extra?.scopes,
        timeoutMs,
        clientName: extra?.clientName ?? GATEWAY_CLIENT_NAMES.CLI,
        mode: extra?.mode ?? GATEWAY_CLIENT_MODES.CLI,
      }),
  );
}
