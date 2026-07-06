// Public ACP runtime helpers for plugins that integrate with ACP control/session state.
export { AcpRuntimeError, isAcpRuntimeError } from "../acp/runtime/errors.ts";
export type { AcpRuntimeErrorCode } from "../acp/runtime/errors.ts";
export {
  getAcpRuntimeBackend,
  registerAcpRuntimeBackend,
  requireAcpRuntimeBackend,
  unregisterAcpRuntimeBackend,
} from "../acp/runtime/registry.ts";
export type {
  AcpRuntime,
  AcpRuntimeCapabilities,
  AcpRuntimeDoctorReport,
  AcpRuntimeEnsureInput,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeStatus,
  AcpRuntimeTurn,
  AcpRuntimeTurnAttachment,
  AcpRuntimeTurnInput,
  AcpRuntimeTurnResult,
  AcpRuntimeTurnResultError,
  AcpSessionUpdateTag,
} from "@openclaw/acp-core/runtime/types";
export { readAcpSessionEntry } from "../acp/runtime/session-meta.ts";
export type { AcpSessionStoreEntry } from "../acp/runtime/session-meta.ts";
export { tryDispatchAcpReplyHook } from "./acp-runtime-backend.ts";

