/**
 * Effective OAuth credential resolver.
 * Delegates to the managed OAuth selector while allowing external CLI
 * bootstrap credentials to fill unusable local profile state.
 */
import { readExternalCliBootstrapCredential } from "./external-cli-sync.ts";
import { resolveEffectiveOAuthCredential as resolveManagedOAuthCredential } from "./oauth-manager.ts";
import type { OAuthCredential } from "./types.ts";

/** Resolves the effective OAuth credential, optionally reading external CLI bootstrap state. */
export function resolveEffectiveOAuthCredential(params: {
  profileId: string;
  credential: OAuthCredential;
  allowKeychainPrompt?: boolean;
}): OAuthCredential {
  return resolveManagedOAuthCredential({
    profileId: params.profileId,
    credential: params.credential,
    readBootstrapCredential: ({ profileId, credential }) =>
      readExternalCliBootstrapCredential({
        profileId,
        credential,
        allowKeychainPrompt: params.allowKeychainPrompt ?? false,
      }),
  });
}
