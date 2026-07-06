// Provider stream helpers expose shared wrapper families and payload transforms for provider plugins.
export {
  createPlainTextToolCallCompatWrapper,
  type ProviderStreamWrapperFactory,
} from "./provider-stream-shared.ts";

/** Named stream-wrapper bundles that provider plugins can opt into without duplicating policy. */
export type ProviderStreamFamily =
  /** Applies Google thinking-level payload normalization. */
  | "google-thinking"
  /** Applies Kilocode proxy reasoning payload normalization. */
  | "kilocode-thinking"
  /** Applies Moonshot thinking type/keep normalization. */
  | "moonshot-thinking"
  /** Enables MiniMax high-speed model routing when requested. */
  | "minimax-fast-mode"
  /** Applies the default OpenAI Responses wrapper stack. */
  | "openai-responses-defaults"
  /** Applies OpenRouter proxy reasoning payload normalization. */
  | "openrouter-thinking"
  /** Enables tool-call event streaming unless explicitly disabled. */
  | "tool-stream-default-on";


// Public stream-wrapper helpers for provider plugins.
export {
  createGoogleThinkingPayloadWrapper,
  sanitizeGoogleThinkingPayload,
} from "../llm/providers/stream-wrappers/google.ts";
