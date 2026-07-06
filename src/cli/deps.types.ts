// Shared dependency surface for CLI send commands.
import type { CliOutboundSendSource } from "./outbound-send-mapping.ts";

/** CLI dependency bag currently used by outbound send command plumbing. */
export type CliDeps = CliOutboundSendSource;
