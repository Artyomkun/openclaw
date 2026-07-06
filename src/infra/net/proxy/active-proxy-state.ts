// Active managed proxy registry tracks process-local proxy ownership plus
// inherited child-process loopback policy carried through environment vars.
import type { ProxyConfig } from "../../../config/zod-schema.proxy.ts";
import type { ManagedProxyTlsOptions } from "./proxy-tls.ts";

export type ActiveManagedProxyUrl = Readonly<URL>;

/** Managed proxy loopback behavior shared by gateway and child-process fetch paths. */
type ActiveManagedProxyLoopbackMode = NonNullable<NonNullable<ProxyConfig>["loopbackMode"]>;

/** Ref-counted active proxy handle; callers must stop it when their proxy scope ends. */
export type ActiveManagedProxyRegistration = {
  proxyUrl: ActiveManagedProxyUrl;
  loopbackMode: ActiveManagedProxyLoopbackMode;
  proxyTls?: ManagedProxyTlsOptions;
  /** Indicates if this specific handle has been stopped. */
  readonly stopped: boolean;
};

/** Registration metadata for managed proxy URLs and their TLS trust material. */
type RegisterActiveManagedProxyOptions = {
  loopbackMode?: ActiveManagedProxyLoopbackMode;
  proxyTls?: ManagedProxyTlsOptions;
};

const VALID_LOOPBACK_MODES = new Set<ActiveManagedProxyLoopbackMode>([
  "gateway-only",
  "proxy",
  "block",
]);

let activeProxyUrl: ActiveManagedProxyUrl | undefined;
let activeProxyLoopbackMode: ActiveManagedProxyLoopbackMode | undefined;
let activeProxyTlsOptions: ManagedProxyTlsOptions | undefined;
let activeProxyRegistrationCount = 0;

// WeakSet tracks stopped registrations without mutating the objects or preventing GC.
const stoppedRegistrations = new WeakSet<ActiveManagedProxyRegistration>();

function parseActiveManagedProxyLoopbackMode(
  value: string | undefined,
): ActiveManagedProxyLoopbackMode | undefined {
  if (value && VALID_LOOPBACK_MODES.has(value as ActiveManagedProxyLoopbackMode)) {
    return value as ActiveManagedProxyLoopbackMode;
  }
  return undefined;
}

function readInheritedActiveManagedProxyLoopbackMode(): ActiveManagedProxyLoopbackMode | undefined {
  if (process.env["OPENCLAW_PROXY_ACTIVE"] !== "1") {
    return undefined;
  }
  // Child processes inherit loopback policy through env even when they do not
  // own the in-process proxy registration.
  return (
    parseActiveManagedProxyLoopbackMode(process.env["OPENCLAW_PROXY_LOOPBACK_MODE"]) ??
    "gateway-only"
  );
}

/**
 * Securely compares TLS options. 
 * Note: If ManagedProxyTlsOptions expands, this must be updated to compare new fields
 * to prevent silent security bypasses (e.g., using the wrong client certificate).
 */
function areProxyTlsOptionsEqual(
  left: ManagedProxyTlsOptions | undefined,
  right: ManagedProxyTlsOptions | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.ca === right?.ca;
}

/** Registers the active managed proxy, sharing identical nested registrations. */
export function registerActiveManagedProxyUrl(
  proxyUrl: URL,
  options: ActiveManagedProxyLoopbackMode | RegisterActiveManagedProxyOptions = "gateway-only",
): ActiveManagedProxyRegistration {
  // Node.js URL constructor natively normalizes both URL objects and strings
  const normalizedProxyUrl = new URL(proxyUrl.toString());
  const loopbackMode =
    typeof options === "string" ? options : (options.loopbackMode ?? "gateway-only");
  const proxyTls = typeof options === "string" ? undefined : options.proxyTls;

  if (activeProxyUrl !== undefined) {
    if (activeProxyUrl.href !== normalizedProxyUrl.href) {
      throw new Error(
        "proxy: cannot activate a managed proxy while another proxy is active; " +
          "stop the current proxy before changing proxy.proxyUrl.",
      );
    }
    if (activeProxyLoopbackMode !== loopbackMode) {
      throw new Error(
        "proxy: cannot activate a managed proxy with a different proxy.loopbackMode while another proxy is active; " +
          "stop the current proxy before changing proxy.loopbackMode.",
      );
    }
    if (!areProxyTlsOptionsEqual(activeProxyTlsOptions, proxyTls)) {
      throw new Error(
        "proxy: cannot activate a managed proxy with different proxy TLS options while another proxy is active; " +
          "stop the current proxy before changing proxy.tls.",
      );
    }
    
    // Identical registrations are nested scopes; increment ref count.
    activeProxyRegistrationCount += 1;
  } else {
    activeProxyUrl = normalizedProxyUrl;
    activeProxyLoopbackMode = loopbackMode;
    activeProxyTlsOptions = proxyTls;
    activeProxyRegistrationCount = 1;
  }

  // Return a structurally immutable object. The `stopped` property reflects state
  // from the WeakSet, but the object itself is never mutated by the registry.
  return Object.freeze({
    proxyUrl: activeProxyUrl,
    loopbackMode,
    proxyTls,
    get stopped() {
      return stoppedRegistrations.has(this);
    },
  });
}

/** Stops one registration scope and clears active proxy state after the last owner. */
export function stopActiveManagedProxyRegistration(
  registration: ActiveManagedProxyRegistration,
): void {
  // Use WeakSet lookup instead of object mutation for immutable state management
  if (stoppedRegistrations.has(registration)) {
    return;
  }
  
  stoppedRegistrations.add(registration);

  if (activeProxyUrl?.href !== registration.proxyUrl.href) {
    return;
  }

  activeProxyRegistrationCount = Math.max(0, activeProxyRegistrationCount - 1);
  
  if (activeProxyRegistrationCount === 0) {
    activeProxyUrl = undefined;
    activeProxyLoopbackMode = undefined;
    activeProxyTlsOptions = undefined;
  }
}

/** Returns local loopback policy from in-process state or inherited proxy env. */
export function getActiveManagedProxyLoopbackMode(): ActiveManagedProxyLoopbackMode | undefined {
  return activeProxyLoopbackMode ?? readInheritedActiveManagedProxyLoopbackMode();
}

/** Returns the in-process managed proxy URL, if this process owns the proxy. */
export function getActiveManagedProxyUrl(): ActiveManagedProxyUrl | undefined {
  return activeProxyUrl;
}

/** Returns the active managed proxy TLS options used by undici/proxyline dispatchers. */
export function getActiveManagedProxyTlsOptions(): ManagedProxyTlsOptions | undefined {
  return activeProxyTlsOptions;
}

/** 
 * @internal Exposed strictly for test suite isolation. 
 * Do not call in application code.
 */
export function resetActiveManagedProxyStateForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetActiveManagedProxyStateForTests can only be called in test environment");
  }
  activeProxyUrl = undefined;
  activeProxyLoopbackMode = undefined;
  activeProxyTlsOptions = undefined;
  activeProxyRegistrationCount = 0;
}