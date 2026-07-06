/** Commands for managing default text model fallbacks. */
import type { RuntimeEnv } from "../../runtime.ts";
import {
  addFallbackCommand,
  clearFallbacksCommand,
  listFallbacksCommand,
  removeFallbackCommand,
} from "./fallbacks-shared.ts";

/** Lists configured text model fallbacks. */
export async function modelsFallbacksListCommand(
  opts: { json?: boolean; plain?: boolean },
  runtime: RuntimeEnv,
) {
  return await listFallbacksCommand({ label: "Fallbacks", key: "model" }, opts, runtime);
}

/** Adds a text model fallback. */
export async function modelsFallbacksAddCommand(modelRaw: string, runtime: RuntimeEnv) {
  return await addFallbackCommand(
    { label: "Fallbacks", key: "model", logPrefix: "Fallbacks" },
    modelRaw,
    runtime,
  );
}

/** Removes a text model fallback. */
export async function modelsFallbacksRemoveCommand(modelRaw: string, runtime: RuntimeEnv) {
  return await removeFallbackCommand(
    {
      label: "Fallbacks",
      key: "model",
      notFoundLabel: "Fallback",
      logPrefix: "Fallbacks",
    },
    modelRaw,
    runtime,
  );
}

/** Clears all text model fallbacks. */
export async function modelsFallbacksClearCommand(runtime: RuntimeEnv) {
  return await clearFallbacksCommand(
    { key: "model", clearedMessage: "Fallback list cleared." },
    runtime,
  );
}
