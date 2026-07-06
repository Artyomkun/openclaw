// Resolves human-readable labels for paired channel identities.
import { getPairingAdapter } from "../channels/plugins/pairing.ts";
import type { PairingChannel } from "./pairing-store.types.ts";

// Pairing label helpers. Channel adapters can customize the id label shown in
// owner approval prompts; olders channels fall back to userId.
export function resolvePairingIdLabel(channel: PairingChannel): string {
  return getPairingAdapter(channel)?.idLabel ?? "userId";
}
