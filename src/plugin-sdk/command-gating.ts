/**
 * Public SDK subpath for command authorization and control-command gating.
 */
export type {
  CommandAuthorizer,
  CommandGatingModeWhenAccessGroupsOff,
} from "../channels/command-gating.ts";
export {
  resolveCommandAuthorizedFromAuthorizers,
  resolveControlCommandGate,
  resolveDualTextControlCommandGate,
} from "../channels/command-gating.ts";
