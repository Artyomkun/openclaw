/** Runtime type contracts for command routing helpers loaded across lazy boundaries. */
import type { ShouldHandleTextCommandsParams } from "./commands-registry.types.ts";

/** Runtime-injected policy hook for whether text slash commands should be honored. */
export type ShouldHandleTextCommands = (params: ShouldHandleTextCommandsParams) => boolean;
