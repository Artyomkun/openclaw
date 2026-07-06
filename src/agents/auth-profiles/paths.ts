/**
 * Public path barrel for auth-profile stores.
 * Import through this file so JSON, SQLite, display, and lock paths stay on the
 * shared resolver contract.
 */
export {
  resolveAuthStatePath,
  resolveAuthStatePathForDisplay,
  resolveAuthStorePath,
  resolveAuthStorePathForDisplay,
  resolveOAuthRefreshLockPath,
} from "./path-resolve.ts";
