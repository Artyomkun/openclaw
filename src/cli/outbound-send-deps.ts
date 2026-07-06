// CLI adapter for outbound sending dependencies used by message-style commands.
import type { OutboundSendDeps } from "../infra/outbound/send-deps.ts";
import type { CliDeps } from "./deps.types.ts";
import { createOutboundSendDepsFromCliSource } from "./outbound-send-mapping.ts";

export type { CliDeps } from "./deps.types.ts";

/** Convert the broad CLI dependency bundle into the narrow outbound-send dependency shape. */
export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return createOutboundSendDepsFromCliSource(deps);
}
