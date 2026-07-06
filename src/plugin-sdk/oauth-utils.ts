// OAuth utility helpers provide PKCE, state, and redirect primitives for plugin auth flows.
import { createHash, randomBytes } from "node:crypto";

/** Generate a PKCE verifier/challenge pair with a 64-character hex verifier. */
export function generateHexPkceVerifierChallenge(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
