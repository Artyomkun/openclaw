/**
 * Interactive outbound compatibility helpers.
 *
 * Re-exports presentation adapters and keeps the deprecated interactive reducer available.
 */
export {
  adaptMessagePresentationForChannel,
  applyPresentationActionLimits,
  presentationPageSize,
} from "./presentation-limits.ts";
