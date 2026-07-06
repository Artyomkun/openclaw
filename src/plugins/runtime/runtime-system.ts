// Runtime system helpers expose host system operations to activated plugin runtimes.
import { requestHeartbeat } from "../../infra/heartbeat-wake.ts";
import { enqueueSystemEvent } from "../../infra/system-events.ts";
import { runCommandWithTimeout } from "../../process/exec.ts";
import { createLazyRuntimeMethod, createLazyRuntimeModule } from "../../shared/lazy-runtime.ts";
import { formatNativeDependencyHint } from "./native-deps.ts";
import type { RunHeartbeatOnceOptions } from "./types-core.ts";
import type { PluginRuntime } from "./types.ts";

const loadHeartbeatRunnerRuntime = createLazyRuntimeModule(
  () => import("../../infra/heartbeat-runner.js"),
);
const runHeartbeatOnceInternal = createLazyRuntimeMethod(
  loadHeartbeatRunnerRuntime,
  (runtime) => runtime.runHeartbeatOnce,
);

/** Creates the plugin runtime system facade with heartbeat/event/process helpers. */
export function createRuntimeSystem(): PluginRuntime["system"] {
  const requestHeartbeatNow: PluginRuntime["system"]["requestHeartbeatNow"] = (opts) =>
    requestHeartbeat({
      source: opts?.source ?? "other",
      intent: opts?.intent ?? "immediate",
      reason: opts?.reason,
      coalesceMs: opts?.coalesceMs,
      agentId: opts?.agentId,
      sessionKey: opts?.sessionKey,
      heartbeat: opts?.heartbeat,
    });

  return {
    enqueueSystemEvent,
    requestHeartbeat,
    requestHeartbeatNow,
    runHeartbeatOnce: (opts?: RunHeartbeatOnceOptions) => {
      // Destructure to forward only the plugin-safe subset; prevent cfg/deps injection at runtime.
      const { reason, agentId, sessionKey, heartbeat } = opts ?? {};
      return runHeartbeatOnceInternal({
        reason,
        agentId,
        sessionKey,
        heartbeat: heartbeat ? { target: heartbeat.target } : undefined,
      });
    },
    runCommandWithTimeout,
    formatNativeDependencyHint,
  };
}
