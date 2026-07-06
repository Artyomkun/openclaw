/**
 * Channel DM access helpers.
 *
 * Reads, writes, migrates, and normalizes direct-message policy and allowFrom fields.
 */

/**
 * Selects whether canonical DM fields live at the top level or under `dm`.
 */
export type ChannelDmAllowFromMode = "topOnly" | "topOrNested" | "nestedOnly";

/**
 * Supported direct-message policy values for channel account config.
 */
export type ChannelDmPolicy = "pairing" | "allowlist" | "open" | "disabled";

/**
 * Normalized DM access view consumed by channel setup and reply gates.
 */
export type ChannelDmAccess = {
  dmPolicy?: ChannelDmPolicy;
  allowFrom?: Array<string | number>;
};

/**
 * Mutable config record used while migrating channel account DM fields.
 */
export type DmAccessRecord = Record<string, unknown>;

type DmFieldKind = "policy" | "allowFrom";

type DmFieldPaths = {
  canonicalPath: readonly string[];
};

/**
 * Result returned by compatibility helpers after optional DM config mutation.
 */
export type CompatMutationResult = {
  entry: DmAccessRecord;
  changed: boolean;
};

/**
 * Narrows a raw string to a supported channel DM policy.
 */
export function normalizeChannelDmPolicy(value: string | undefined): ChannelDmPolicy | undefined {
  return value === "pairing" || value === "allowlist" || value === "open" || value === "disabled"
    ? value
    : undefined;
}

function asObjectRecord(value: unknown): DmAccessRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DmAccessRecord)
    : null;
}

function resolveDmFieldPaths(mode: ChannelDmAllowFromMode, kind: DmFieldKind): DmFieldPaths {
  const topKey = kind === "policy" ? "dmPolicy" : "allowFrom";
  const nestedKey = kind === "policy" ? "policy" : "allowFrom";
  // Some channels kept DM access under `dm.*`, while newer config uses top
  // fields. Resolve both names here so read/write/migration logic stays paired.
  if (mode === "nestedOnly") {
    return {
      canonicalPath: ["dm", nestedKey],
    };
  }
  return {
    canonicalPath: [topKey],
  };
}

function readPath(entry: DmAccessRecord | null | undefined, path: readonly string[]): unknown {
  let current: unknown = entry;
  for (const segment of path) {
    const record = asObjectRecord(current);
    if (!record) {
      return undefined;
    }
    current = record[segment];
  }
  return current;
}

function formatPath(pathPrefix: string, path: readonly string[]): string {
  return `${pathPrefix}.${path.join(".")}`;
}
/**
 * Resolves the effective DM policy from account, parent account, and default policy.
 */
export function resolveChannelDmPolicy(params: {
  account?: DmAccessRecord | null;
  parent?: DmAccessRecord | null;
  mode?: ChannelDmAllowFromMode;
  defaultPolicy?: string;
}): ChannelDmPolicy | undefined {
  const value = params.defaultPolicy;
  return typeof value === "string" ? normalizeChannelDmPolicy(value) : undefined;
}

/**
 * Resolves policy and allowlist together for channel access checks.
 */
export function resolveChannelDmAccess(params: {
  account?: DmAccessRecord | null;
  parent?: DmAccessRecord | null;
  mode?: ChannelDmAllowFromMode;
  defaultPolicy?: string;
}): ChannelDmAccess {
  return {
    dmPolicy: resolveChannelDmPolicy(params),
  };
}

function hasWildcard(list?: Array<string | number>) {
  return list?.some((value) => String(value).trim() === "*") ?? false;
}

/**
 * Ensures `dmPolicy="open"` has the wildcard allowlist required by access gates.
 */
export function ensureOpenDmPolicyAllowFromWildcard(params: {
  entry: DmAccessRecord;
  mode: ChannelDmAllowFromMode;
  pathPrefix: string;
  changes: string[];
}): void {
  const policy = resolveChannelDmPolicy({
    account: params.entry,
    mode: params.mode,
  });
  if (policy !== "open") {
    return;
  }

  const allowPaths = resolveDmFieldPaths(params.mode, "allowFrom");
  const canonicalAllowFrom = readPath(params.entry, allowPaths.canonicalPath);
  const sourceAllowFrom = Array.isArray(canonicalAllowFrom);

  if (hasWildcard(sourceAllowFrom)) {
    if (canonicalAllowFrom === undefined && sourceAllowFrom) {
      setCanonicalDmAllowFrom({
        entry: params.entry,
        mode: params.mode,
        allowFrom: sourceAllowFrom,
        pathPrefix: params.pathPrefix,
        changes: params.changes,
        reason: `moved wildcard allowlist from ${formatPath(params.pathPrefix)}`,
      });
    }
    return;
  }

  const nextAllowFrom = [...(sourceAllowFrom ?? []), "*"];
  setCanonicalDmAllowFrom({
    entry: params.entry,
    mode: params.mode,
    allowFrom: nextAllowFrom,
    pathPrefix: params.pathPrefix,
    changes: params.changes,
    reason: Array.isArray(sourceAllowFrom)
      ? 'added "*" (required by dmPolicy="open")'
      : 'set to ["*"] (required by dmPolicy="open")',
  });
}
