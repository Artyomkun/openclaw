// Streams LLM responses through registered providers and normalizes events.
import { registerBuiltInApiProviders } from "./providers/register-builtins.ts";

// Register built-ins as a side effect before re-exporting the shared runtime stream API.
registerBuiltInApiProviders();

export {
  complete,
  completeSimple,
  stream,
  streamSimple,
} from "../../packages/llm-runtime/src/stream.ts";
export { getEnvApiKey } from "./env-api-keys.ts";
