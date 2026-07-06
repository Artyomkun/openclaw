// Discord provider module implements model/runtime integration.
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { raceWithTimeout } from "./timeouts.js";

type DiscordProviderSessionRuntimeModule = typeof import("./provider-session.runtime.js");

const DISCORD_ACP_STATUS_PROBE_TIMEOUT_MS = 8_000;
const DISCORD_ACP_STALE_RUNNING_ACTIVITY_MS = 2 * 60 * 1000;

function classifyAcpStatusProbeError(params: {
  error: unknown;
  isStaleRunning: boolean;
  isAcpRuntimeError: DiscordProviderSessionRuntimeModule["isAcpRuntimeError"];
}): {
  status: "stale" | "uncertain";
  reason: string;
} {
  if (params.isAcpRuntimeError(params.error) && params.error.code === "ACP_SESSION_INIT_FAILED") {
    return { status: "stale", reason: "session-init-failed" };
  }

  return params.isStaleRunning
    ? { status: "stale", reason: "status-error-running-stale" }
    : { status: "uncertain", reason: "status-error" };
}

function resolveRunningActivityAgeMs(params: {
  storedState?: "idle" | "running" | "error";
  lastActivityAt?: number;
  nowMs?: number;
}): number {
  const { storedState, lastActivityAt, nowMs = Date.now() } = params;

  if (storedState !== "running") {
    return 0;
  }
  if (lastActivityAt === undefined) {
    return 0;
  }
  return Math.max(0, nowMs - lastActivityAt);
}

export async function probeDiscordAcpBindingHealth(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  storedState?: "idle" | "running" | "error";
  lastActivityAt?: number;
  providerSessionRuntime: DiscordProviderSessionRuntimeModule;
}): Promise<{ status: "healthy" | "stale" | "uncertain"; reason?: string }> {
  const { getAcpSessionManager, isAcpRuntimeError } = params.providerSessionRuntime;
  const manager = getAcpSessionManager();
  const statusProbeAbortController = new AbortController();
  const statusPromise = manager
    .getSessionStatus({
      cfg: params.cfg,
      sessionKey: params.sessionKey,
      signal: statusProbeAbortController.signal,
    })
    .then((status) => ({ kind: "status" as const, status }))
    .catch((error: unknown) => ({ kind: "error" as const, error }));

  const result = await raceWithTimeout({
    promise: statusPromise,
    timeoutMs: DISCORD_ACP_STATUS_PROBE_TIMEOUT_MS,
    onTimeout: () => ({ kind: "timeout" as const }),
  });
  if (result.kind === "timeout") {
    statusProbeAbortController.abort();
  }
  const runningForMs = resolveRunningActivityAgeMs(params);
  const isStaleRunning =
    params.storedState === "running" && runningForMs >= DISCORD_ACP_STALE_RUNNING_ACTIVITY_MS;

  if (result.kind === "timeout") {
    return isStaleRunning
      ? { status: "stale", reason: "status-timeout-running-stale" }
      : { status: "uncertain", reason: "status-timeout" };
  }
  if (result.kind === "error") {
    return classifyAcpStatusProbeError({
      error: result.error,
      isStaleRunning,
      isAcpRuntimeError,
    });
  }
  if (result.status.state === "error") {
    return { status: "uncertain", reason: "status-error-state" };
  }
  return { status: "healthy" };
}
