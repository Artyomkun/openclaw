// Persistent dedupe helpers give plugins bounded replay protection across process restarts.
import { createHash } from "node:crypto";
import { createDedupeCache } from "../infra/dedupe.ts";
import { resolveNonNegativeIntegerOption } from "../infra/numeric-options.ts";

const DEFAULT_NAMESPACE_PREFIX = "persistent-dedupe";

export type PersistentDedupeEntry = {
  key: string;
  seenAt: number;
};

type PersistentDedupeBaseOptions = {
  /** Milliseconds a recorded key remains recent; `0` keeps keys until cache pruning. */
  ttlMs: number;
  /** Maximum process-local cache entries used before consulting SQLite. */
  memoryMaxSize: number;
  onDiskError?: (error: unknown) => void;
};

/** Configuration for a SQLite plugin-state dedupe namespace cache. */
export type PersistentDedupePluginStateOptions = PersistentDedupeBaseOptions & {
  /** Plugin id that owns the persisted dedupe namespace. */
  pluginId: string;
  /** Prefix for persisted plugin-state namespaces; defaults to `persistent-dedupe`. */
  namespacePrefix?: string;
  /** Maximum persisted entries retained per namespace. */
  stateMaxEntries: number;
  /** Test/runtime env used to resolve the shared OpenClaw state database. */
  env?: NodeJS.ProcessEnv;
  resolveFilePath?: undefined;
  fileMaxEntries?: undefined;
  lockOptions?: undefined;
};

/** Per-call options used when checking or recording a dedupe key. */
export type PersistentDedupeCheckOptions = {
  /** Logical bucket for the key; omitted/blank values use `global`. */
  namespace?: string;
  /** Test or replay timestamp override used for TTL checks and writes. */
  now?: number;
  /** Per-call disk error hook, overriding the helper-level hook. */
  onDiskError?: (error: unknown) => void;
};

/** Disk-backed dedupe guard that records recently seen keys per namespace. */
export type PersistentDedupe = {
  /** Returns true only when the key was not recently seen and was recorded for future checks. */
  checkAndRecord: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  /** Checks memory/disk recency without recording a new timestamp. */
  hasRecent: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  /** Removes a recorded key from process memory and persisted storage. */
  forget: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  /** Loads recent disk entries into memory for one namespace and returns the loaded count. */
  warmup: (namespace?: string, onError?: (error: unknown) => void) => Promise<number>;
  /** Clears only process-local memory; persisted namespace files are left intact. */
  clearMemory: () => void;
  /** Returns the current process-local cache size. */
  memorySize: () => number;
};

/** Claim attempt result for dedupe flows that need in-flight ownership. */
export type ClaimableDedupeClaimResult =
  | { kind: "claimed" }
  | { kind: "duplicate" }
  | { kind: "inflight"; pending: Promise<boolean> };

/** Options for a claimable dedupe guard, either persistent or memory-only. */
export type ClaimableDedupeOptions =
  | PersistentDedupePluginStateOptions
  | {
      ttlMs: number;
      memoryMaxSize: number;
      pluginId?: undefined;
      stateMaxEntries?: undefined;
      namespacePrefix?: undefined;
      env?: undefined;
      resolveFilePath?: undefined;
      fileMaxEntries?: undefined;
      lockOptions?: undefined;
      onDiskError?: undefined;
    };

/** Dedupe guard that lets one caller own a key while others wait or detect duplicates. */
export type ClaimableDedupe = {
  /** Starts ownership of a key, reports duplicates, or returns the active claim's pending result. */
  claim: (
    key: string,
    options?: PersistentDedupeCheckOptions,
  ) => Promise<ClaimableDedupeClaimResult>;
  /** Records a claimed key as handled and resolves any waiters with the recorded result. */
  commit: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  /** Releases an active claim without recording it, rejecting waiters with the supplied error. */
  release: (
    key: string,
    options?: {
      namespace?: string;
      error?: unknown;
    },
  ) => void;
  /** Checks whether the key is recent without claiming or committing it. */
  hasRecent: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  /** Removes an active or committed key from memory and persisted storage when supported. */
  forget?: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  /** Warms persistent storage into memory when configured; memory-only guards return zero. */
  warmup: (namespace?: string, onError?: (error: unknown) => void) => Promise<number>;
  /** Clears process-local caches and in-memory persistent state. */
  clearMemory: () => void;
  /** Returns the current process-local cache size. */
  memorySize: () => number;
};

function resolveNamespace(namespace?: string): string {
  return namespace?.trim() || "global";
}

function resolveScopedKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function resolveUnknownEntrySeenAt(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || !("seenAt" in value)) {
    return undefined;
  }
  return typeof value.seenAt === "number" && Number.isFinite(value.seenAt)
    ? value.seenAt
    : undefined;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function normalizeNamespacePrefix(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_NAMESPACE_PREFIX)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 48);
  return normalized || DEFAULT_NAMESPACE_PREFIX;
}

function resolveStateNamespace(prefix: string, namespace: string): string {
  return `${prefix}.${shortHash(namespace)}`;
}

export function resolvePersistentDedupePluginStateNamespace(options: {
  namespace: string;
  namespacePrefix?: string;
}): string {
  return resolveStateNamespace(
    normalizeNamespacePrefix(options.namespacePrefix),
    resolveNamespace(options.namespace),
  );
}

export function shouldReplacePersistentDedupeEntry(params: {
  existingValue: unknown;
  incomingValue: unknown;
}): boolean {
  const incomingSeenAt = resolveUnknownEntrySeenAt(params.incomingValue);
  return (
    incomingSeenAt != null &&
    incomingSeenAt > (resolveUnknownEntrySeenAt(params.existingValue) ?? 0)
  );
}

function createReleasedClaimError(scopedKey: string): Error {
  return new Error(`claim released before commit: ${scopedKey}`);
}

/** Create a claim/commit/release dedupe guard backed by memory and optional persistent storage. */
export function createClaimableDedupe(
  options: ClaimableDedupeOptions,
): ClaimableDedupe & Required<Pick<ClaimableDedupe, "forget">> {
  const ttlMs = resolveNonNegativeIntegerOption(options.ttlMs, 0);
  const memoryMaxSize = resolveNonNegativeIntegerOption(options.memoryMaxSize, 0);
  const memory = createDedupeCache({ ttlMs, maxSize: memoryMaxSize });
  let persistent: PersistentDedupe | null = null;

  const inflight = new Map<
    string,
    {
      promise: Promise<boolean>;
      resolve: (result: boolean) => void;
      reject: (error: unknown) => void;
    }
  >();

  async function hasRecent(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return false;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    if (persistent) {
      return persistent.hasRecent(trimmed, dedupeOptions);
    }
    return memory.peek(scopedKey, dedupeOptions?.now);
  }

  async function forget(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return false;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const claimValue = inflight.get(scopedKey);
    claimValue?.reject(createReleasedClaimError(scopedKey));
    inflight.delete(scopedKey);
    if (persistent) {
      return persistent.forget(trimmed, dedupeOptions);
    }
    memory.delete(scopedKey);
    return true;
  }

  async function claim(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<ClaimableDedupeClaimResult> {
    const trimmed = key.trim();
    if (!trimmed) {
      return { kind: "claimed" };
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const existing = inflight.get(scopedKey);
    if (existing) {
      return { kind: "inflight", pending: existing.promise };
    }

    let resolve!: (result: boolean) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<boolean>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    void promise.catch(() => {});
    inflight.set(scopedKey, { promise, resolve, reject });
    try {
      if (await hasRecent(trimmed, dedupeOptions)) {
        resolve(false);
        inflight.delete(scopedKey);
        return { kind: "duplicate" };
      }
      return { kind: "claimed" };
    } catch (error) {
      reject(error);
      inflight.delete(scopedKey);
      throw error;
    }
  }

  async function commit(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return true;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const claimValue = inflight.get(scopedKey);
    try {
      const recorded = persistent
        ? await persistent.checkAndRecord(trimmed, dedupeOptions)
        : !memory.check(scopedKey, dedupeOptions?.now);
      claimValue?.resolve(recorded);
      return recorded;
    } catch (error) {
      claimValue?.reject(error);
      throw error;
    } finally {
      inflight.delete(scopedKey);
    }
  }

  function release(
    key: string,
    dedupeOptions?: {
      namespace?: string;
      error?: unknown;
    },
  ): void {
    const trimmed = key.trim();
    if (!trimmed) {
      return;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const claimLocal = inflight.get(scopedKey);
    if (!claimLocal) {
      return;
    }
    claimLocal.reject(dedupeOptions?.error ?? createReleasedClaimError(scopedKey));
    inflight.delete(scopedKey);
  }

  return {
    claim,
    commit,
    release,
    hasRecent,
    forget,
    warmup: persistent?.warmup ?? (async () => 0),
    clearMemory: () => {
      persistent?.clearMemory();
      memory.clear();
    },
    memorySize: () => persistent?.memorySize() ?? memory.size(),
  };
}
