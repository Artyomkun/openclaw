// Delivery context helpers normalize target and route metadata for delivery.
export {
  deliveryContextFromSession,
  deliveryContextKey,
  mergeDeliveryContext,
  normalizeDeliveryContext,
} from "./delivery-context.shared.ts";
export type { DeliveryContext } from "./delivery-context.types.ts";
