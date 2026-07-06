// Lazy runtime imports keep approval forwarding testable without eagerly loading
// channel delivery code.
export { resolveExecApprovalSessionTarget } from "./exec-approval-session-target.ts";
export { sendDurableMessageBatch } from "../channels/message/runtime.ts";
