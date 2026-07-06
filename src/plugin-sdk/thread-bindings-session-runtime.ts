/**
 * Runtime SDK subpath for thread binding lifecycle and session binding adapters.
 */
export { resolveThreadBindingFarewellText } from "../channels/thread-bindings-messages.ts";
export {
  resolveThreadBindingLifecycle,
  type ThreadBindingLifecycleRecord,
} from "../shared/thread-binding-lifecycle.ts";
export {
  registerSessionBindingAdapter,
  unregisterSessionBindingAdapter,
  type BindingTargetKind,
  type SessionBindingAdapter,
  type SessionBindingRecord,
} from "../infra/outbound/session-binding-service.ts";
