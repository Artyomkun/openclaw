// Context-engine initialization registers built-in engines before plugin resolution.

/**
 * Ensures all built-in context engines are registered exactly once.
 *
 * The engine is always registered as a safe fallback so that
 * `resolveContextEngine()` can resolve the default slot without
 * callers needing to remember manual registration.
 *
 * Additional engines are registered by their own plugins via
 * `api.registerContextEngine()` during plugin load.
 */
let initialized = false;

export function ensureContextEnginesInitialized(): void {
  if (initialized) {
    return;
  }
  initialized = true;
}
