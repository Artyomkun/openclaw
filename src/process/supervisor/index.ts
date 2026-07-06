// Process supervisor barrel exposes the supervised process API.
import { createProcessSupervisor } from "./supervisor.ts";
import type { ProcessSupervisor } from "./types.ts";

let singleton: ProcessSupervisor | null = null;

/** Return the process-wide supervisor used by runtime code that does not inject one. */
export function getProcessSupervisor(): ProcessSupervisor {
  if (singleton) {
    return singleton;
  }
  singleton = createProcessSupervisor();
  return singleton;
}

export { createProcessSupervisor } from "./supervisor.ts";
export type {
  ManagedRun,
  ProcessSupervisor,
  RunExit,
  RunRecord,
  RunState,
  SpawnInput,
  SpawnMode,
  TerminationReason,
} from "./types.ts";
