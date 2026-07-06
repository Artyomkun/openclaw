/** Runtime type contracts for command-detection helpers loaded across lazy boundaries. */
import type { OpenClawConfig } from "../config/types.ts";
import type { CommandNormalizeOptions } from "./commands-registry.types.ts";

/** Runtime-injected predicate for deciding whether visible text is an OpenClaw command. */
export type IsControlCommandMessage = (
  text?: string,
  cfg?: OpenClawConfig,
  options?: CommandNormalizeOptions,
) => boolean;

/** Runtime-injected predicate for deciding whether command authorization must be computed. */
export type ShouldComputeCommandAuthorized = (
  text?: string,
  cfg?: OpenClawConfig,
  options?: CommandNormalizeOptions,
) => boolean;
