// TTS shared types describe speech requests, responses, and runtime config.
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import type {
  ResolvedTtsPersona,
  TtsAutoMode,
  TtsConfig,
  TtsMode,
  TtsProvider,
} from "../config/types.tts.ts";
import type { SpeechModelOverridePolicy, SpeechProviderConfig } from "./provider-types.ts";

/** Resolved directive override policy after config defaults are applied. */
export type ResolvedTtsModelOverrides = SpeechModelOverridePolicy;

/** Fully resolved TTS runtime config consumed by synthesis and status paths. */
export type ResolvedTtsConfig = {
  auto: TtsAutoMode;
  mode: TtsMode;
  provider: TtsProvider;
  providerSource: "config" | "default";
  persona?: string;
  personas: Record<string, ResolvedTtsPersona>;
  summaryModel?: string;
  modelOverrides: ResolvedTtsModelOverrides;
  providerConfigs: Record<string, SpeechProviderConfig>;
  prefsPath?: string;
  maxTextLength: number;
  timeoutMs: number;
  timeoutMsSource?: "config" | "default";
  rawConfig?: TtsConfig;
  sourceConfig?: OpenClawConfig;
};
