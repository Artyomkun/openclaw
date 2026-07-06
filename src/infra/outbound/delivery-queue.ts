// Public outbound delivery queue facade for storage and recovery operations.
export {
  ackDelivery,
  enqueueDelivery,
  failDelivery,
  loadPendingDelivery,
  loadPendingDeliveries,
  markDeliveryPlatformOutcomeUnknown,
  markDeliveryPlatformSendAttemptStarted,
  moveToFailed,
} from "./delivery-queue-storage.ts";
export type {
  QueuedDelivery,
  QueuedDeliveryPayload,
  QueuedReplyPayloadSendingHook,
  QueuedRenderedMessageBatchPlan,
} from "./delivery-queue-storage.ts";
export {
  computeBackoffMs,
  drainPendingDeliveries,
  isEntryEligibleForRecoveryRetry,
  isPermanentDeliveryError,
  MAX_RETRIES,
  recoverPendingDeliveries,
  withActiveDeliveryClaim,
} from "./delivery-queue-recovery.ts";
export type {
  ActiveDeliveryClaimResult,
  DeliverFn,
  PendingDeliveryDrainDecision,
  RecoveryLogger,
  RecoverySummary,
} from "./delivery-queue-recovery.ts";
