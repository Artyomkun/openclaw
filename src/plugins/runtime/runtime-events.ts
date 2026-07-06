// Runtime event helpers bridge core agent events into plugin runtime hooks.
import { onAgentEvent } from "../../infra/agent-events.ts";
import { onSessionTranscriptUpdate } from "../../sessions/transcript-events.ts";
import type { PluginRuntime } from "./types.ts";

/** Creates the plugin runtime event subscription facade. */
export function createRuntimeEvents(): PluginRuntime["events"] {
  return {
    onAgentEvent,
    onSessionTranscriptUpdate,
  };
}
