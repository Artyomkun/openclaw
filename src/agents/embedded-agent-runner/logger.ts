/**
 * Shared subsystem logger for embedded-agent runner internals.
 */
import { createSubsystemLogger } from "../../logging/subsystem.ts";

/**
 * Shared logger for embedded-agent runner internals.
 */
export const log = createSubsystemLogger("agent/embedded");
