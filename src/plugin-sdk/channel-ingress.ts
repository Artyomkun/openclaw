// Channel ingress helpers normalize inbound channel messages before agent routing.
import { normalizeStringEntries } from "../../packages/normalization-core/src/string-normalization.ts";
import {
  decideChannelIngress,
  resolveChannelIngressState as resolveChannelIngressStateInternal,
} from "../channels/message-access/index.ts";
import type {
  AccessGraphGate,
  ChannelIngressDecision,
  ChannelIngressIdentifierKind,
  ChannelIngressPolicyInput,
  ChannelIngressState,
  ChannelIngressStateInput as MessageAccessChannelIngressStateInput,
  IngressGateKind,
  IngressGatePhase,
  InternalChannelIngressAdapter,
  InternalChannelIngressNormalizeResult,
  InternalChannelIngressSubject,
  InternalMatchMaterial,
  InternalNormalizedEntry,
  IngressReasonCode,
} from "../channels/message-access/index.ts";
import type { AccessFacts, ChannelTurnAdmission } from "../channels/turn/types.ts";
import type {
  DmGroupAccessDecision,
  DmGroupAccessReasonCode,
} from "../security/dm-policy-shared.ts";

export { decideChannelIngress };
export type {
  AccessGraph,
  AccessGraphGate,
  AccessGroupMembershipFact,
  ChannelIngressAdmission,
  ChannelIngressChannelId,
  ChannelIngressDecision,
  ChannelIngressEventInput,
  ChannelIngressIdentifierKind,
  ChannelIngressNormalizedEntry,
  ChannelIngressPolicyInput,
  ChannelIngressState,
  IngressGateEffect,
  IngressGateKind,
  IngressGatePhase,
  IngressReasonCode,
  MatchableIdentifier,
  RedactedChannelIngressEvent,
  RedactedIngressAllowlistFacts,
  RedactedIngressEntryDiagnostic,
  RedactedIngressMatch,
  ResolvedIngressAllowlist,
  ResolvedRouteGateFacts,
  RouteGateFacts,
  RouteGateState,
  RouteSenderAllowlistSource,
  RouteSenderPolicy,
} from "../channels/message-access/index.ts";

/** Redacted identifier material that can be matched against channel allowlist entries. */
export type ChannelIngressSubjectIdentifier = InternalMatchMaterial;
/** Inbound actor identity described by one or more channel-specific identifiers. */
export type ChannelIngressSubject = InternalChannelIngressSubject;
/** Normalized allowlist entry produced by a channel ingress adapter. */
export type ChannelIngressAdapterEntry = InternalNormalizedEntry;
/** Adapter normalization output split into matchable, invalid, and disabled entries. */
export type ChannelIngressAdapterNormalizeResult = InternalChannelIngressNormalizeResult;
/** Channel-specific allowlist normalizer and subject matcher used by ingress policy. */
export type ChannelIngressAdapter = InternalChannelIngressAdapter;
/** SDK-facing input shape for resolving redacted channel ingress state. */
export type ChannelIngressStateInput = MessageAccessChannelIngressStateInput;

declare const CHANNEL_INGRESS_PLUGIN_ID: unique symbol;

/** Branded plugin id used in stable ingress diagnostics and generated gate identifiers. */
export type ChannelIngressPluginId = string & {
  readonly [CHANNEL_INGRESS_PLUGIN_ID]: true;
};

/** Selector for a single access-graph gate in an ingress decision. */
export type ChannelIngressGateSelector = {
  phase: IngressGatePhase;
  kind: IngressGateKind;
};

/** Canonical direct/group and command/non-command decisions for one inbound event. */
export type ChannelIngressDecisionBundle = {
  dm: ChannelIngressDecision;
  group: ChannelIngressDecision;
  dmCommand: ChannelIngressDecision;
  groupCommand: ChannelIngressDecision;
};

/** Side effect produced while handling an ingress decision before turn admission is mapped. */
export type ChannelIngressSideEffectResult =
  | { kind: "none" }
  | { kind: "pairing-reply-sent" }
  | { kind: "pairing-reply-failed"; errorCode?: string }
  | { kind: "command-reply-sent" }
  | { kind: "command-reply-failed"; errorCode?: string }
  | { kind: "pending-history-recorded" }
  | { kind: "local-event-handled" };

/** Minimal redacted decision summary suitable for logs and plugin diagnostics. */
export type RedactedIngressDiagnostics = {
  decisiveGateId?: string;
  reasonCode: IngressReasonCode;
};

/** Stable selectors for the ingress gates most plugin SDK callers inspect. */
export const CHANNEL_INGRESS_GATE_SELECTORS = {
  command: { phase: "command", kind: "command" },
  activation: { phase: "activation", kind: "mention" },
  dmSender: { phase: "sender", kind: "dmSender" },
  groupSender: { phase: "sender", kind: "groupSender" },
  event: { phase: "event", kind: "event" },
} as const satisfies Record<string, ChannelIngressGateSelector>;

/** Input descriptor for a single channel subject identifier before redacted normalization. */
export type ChannelIngressSubjectIdentifierInput = {
  value: string;
  opaqueId?: string;
  kind?: ChannelIngressIdentifierKind;
  dangerous?: boolean;
  sensitivity?: "normal" | "pii";
};

/** Options for the common one-string-id allowlist adapter. */
export type CreateChannelIngressStringAdapterParams = {
  kind?: ChannelIngressIdentifierKind;
  normalizeEntry?: (value: string) => string | null | undefined;
  normalizeSubject?: (value: string) => string | null | undefined;
  isWildcardEntry?: (value: string) => boolean;
  resolveEntryId?: (params: { entry: string; index: number }) => string;
  dangerous?: boolean | ((entry: string) => boolean);
  sensitivity?: "normal" | "pii";
};

/** Options for adapters that expand each allowlist entry into multiple identifier records. */
export type CreateChannelIngressMultiIdentifierAdapterParams = {
  normalizeEntry: (entry: string, index: number) => readonly ChannelIngressAdapterEntry[];
  getEntryMatchKey?: (entry: ChannelIngressAdapterEntry) => string | null | undefined;
  getSubjectMatchKeys?: (
    identifier: ChannelIngressSubjectIdentifier,
  ) => readonly (string | null | undefined)[];
  isWildcardEntry?: (entry: ChannelIngressAdapterEntry) => boolean;
};

/** Older DM/group access projection retained for older channel runtime callers. */
export type ChannelIngressDmGroupAccessProjection = {
  decision: DmGroupAccessDecision;
  reasonCode: DmGroupAccessReasonCode;
  reason: string;
};

/** Sender-only group access projection used when command and sender gates are evaluated separately. */
export type ChannelIngressSenderGroupAccessProjection = {
  allowed: boolean;
  groupPolicy: ChannelIngressPolicyInput["groupPolicy"];
  providerMissingFallbackApplied: boolean;
  reason: "allowed" | "disabled" | "empty_allowlist" | "sender_not_allowlisted";
};

function defaultNormalize(value: string): string {
  return value;
}

function normalizeMatchValue(
  value: string,
  normalize: (value: string) => string | null | undefined,
): string | null {
  const normalized = normalize(value);
  return normalized == null ? null : normalized.trim() || null;
}

function resolveDangerous(
  dangerous: CreateChannelIngressStringAdapterParams["dangerous"],
  entry: string,
): boolean | undefined {
  return typeof dangerous === "function" ? dangerous(entry) : dangerous;
}

function defaultIngressMatchKey(params: {
  kind: ChannelIngressIdentifierKind;
  value: string;
}): string {
  return `${params.kind}:${params.value}`;
}

/** Find the first gate matching a selector in an ingress decision graph. */
export function findChannelIngressGate(
  decision: ChannelIngressDecision,
  selector: ChannelIngressGateSelector,
): AccessGraphGate | undefined {
  return decision.graph.gates.find(
    (gate) => gate.phase === selector.phase && gate.kind === selector.kind,
  );
}

/** Find the sender gate for a DM or group ingress decision. */
export function findChannelIngressSenderGate(
  decision: ChannelIngressDecision,
  params: { isGroup: boolean },
): AccessGraphGate | undefined {
  return findChannelIngressGate(
    decision,
    params.isGroup
      ? CHANNEL_INGRESS_GATE_SELECTORS.groupSender
      : CHANNEL_INGRESS_GATE_SELECTORS.dmSender,
  );
}

/** Find the command authorization gate in an ingress decision, when command policy ran. */
export function findChannelIngressCommandGate(
  decision: ChannelIngressDecision,
): AccessGraphGate | undefined {
  return findChannelIngressGate(decision, CHANNEL_INGRESS_GATE_SELECTORS.command);
}

/** Run base and command ingress decisions for both DM and group states. */
export function decideChannelIngressBundle(params: {
  directState: ChannelIngressState;
  groupState: ChannelIngressState;
  basePolicy: ChannelIngressPolicyInput;
  commandPolicy: ChannelIngressPolicyInput;
}): ChannelIngressDecisionBundle {
  return {
    dm: decideChannelIngress(params.directState, params.basePolicy),
    group: decideChannelIngress(params.groupState, params.basePolicy),
    dmCommand: decideChannelIngress(params.directState, params.commandPolicy),
    groupCommand: decideChannelIngress(params.groupState, params.commandPolicy),
  };
}

function projectGroupPolicy(
  gate: AccessGraphGate | undefined,
): NonNullable<AccessFacts["group"]>["policy"] {
  const policy = gate?.sender?.policy;
  return policy === "open" || policy === "disabled" ? policy : "allowlist";
}

function projectMentionFacts(gate: AccessGraphGate | undefined): AccessFacts["mentions"] {
  const activation = gate?.activation;
  if (!activation?.hasMentionFacts) {
    return undefined;
  }
  return {
    canDetectMention: activation.canDetectMention ?? false,
    wasMentioned: activation.wasMentioned ?? false,
    hasAnyMention: activation.hasAnyMention,
    implicitMentionKinds: activation.implicitMentionKinds
      ? [...activation.implicitMentionKinds]
      : undefined,
    requireMention: activation.requireMention,
    effectiveWasMentioned: activation.effectiveWasMentioned,
    shouldSkip: activation.shouldSkip,
  };
}

function projectDmDecision(
  decision: ChannelIngressDecision,
  dmSender: AccessGraphGate | undefined,
): NonNullable<AccessFacts["dm"]>["decision"] {
  if (decision.decision === "pairing") {
    return "pairing";
  }
  if (dmSender) {
    return dmSender.allowed ? "allow" : "deny";
  }
  return decision.admission === "drop" ? "deny" : "allow";
}

/** Project a full ingress decision graph into the older AccessFacts shape used by channels. */
export function projectIngressAccessFacts(decision: ChannelIngressDecision): AccessFacts {
  const command = findChannelIngressGate(decision, CHANNEL_INGRESS_GATE_SELECTORS.command);
  const activation = findChannelIngressGate(decision, CHANNEL_INGRESS_GATE_SELECTORS.activation);
  const dmSender = findChannelIngressGate(decision, CHANNEL_INGRESS_GATE_SELECTORS.dmSender);
  const groupSender = findChannelIngressGate(decision, CHANNEL_INGRESS_GATE_SELECTORS.groupSender);
  const event = findChannelIngressGate(decision, CHANNEL_INGRESS_GATE_SELECTORS.event);
  return {
    dm: {
      decision: projectDmDecision(decision, dmSender),
      reason: dmSender?.reasonCode ?? decision.reasonCode,
      allowFrom: [],
      allowlist: dmSender?.allowlist,
    },
    group: {
      policy: projectGroupPolicy(groupSender),
      routeAllowed: !decision.graph.gates.some(
        (gate) => gate.phase === "route" && gate.effect === "block-dispatch",
      ),
      senderAllowed: groupSender?.allowed ?? dmSender?.allowed ?? false,
      allowFrom: [],
      requireMention: activation?.activation?.requireMention ?? false,
      allowlist: groupSender?.allowlist,
    },
    commands: command?.command
      ? {
          authorized: command.allowed,
          shouldBlockControlCommand: command.command.shouldBlockControlCommand,
          reasonCode: command.reasonCode,
          useAccessGroups: command.command.useAccessGroups,
          allowTextCommands: command.command.allowTextCommands,
          modeWhenAccessGroupsOff: command.command.modeWhenAccessGroupsOff,
          // Ingress decisions keep redacted gate facts; older AccessFacts preserves
          // the authorizers property but does not expose individual sender entries.
          authorizers: [],
        }
      : undefined,
    event: event?.event
      ? {
          ...event.event,
          authorized: event.allowed,
          reasonCode: event.reasonCode,
        }
      : undefined,
    mentions: projectMentionFacts(activation),
  };
}

/** Convert an ingress graph decision plus any local side effect into channel turn admission. */
export function mapChannelIngressDecisionToTurnAdmission(
  decision: ChannelIngressDecision,
  sideEffect: ChannelIngressSideEffectResult,
): ChannelTurnAdmission {
  if (decision.admission === "dispatch") {
    return { kind: "dispatch", reason: decision.reasonCode };
  }
  if (decision.admission === "observe") {
    return { kind: "observeOnly", reason: decision.reasonCode };
  }
  if (decision.admission === "pairing-required") {
    return sideEffect.kind === "pairing-reply-sent"
      ? { kind: "handled", reason: decision.reasonCode }
      : { kind: "drop", reason: decision.reasonCode };
  }
  if (decision.admission === "skip") {
    return sideEffect.kind === "pending-history-recorded" ||
      sideEffect.kind === "local-event-handled" ||
      sideEffect.kind === "command-reply-sent"
      ? { kind: "handled", reason: decision.reasonCode }
      : { kind: "drop", reason: decision.reasonCode, recordHistory: false };
  }
  return sideEffect.kind === "local-event-handled" || sideEffect.kind === "command-reply-sent"
    ? { kind: "handled", reason: decision.reasonCode }
    : { kind: "drop", reason: decision.reasonCode };
}

/** Brand a non-empty plugin id for channel ingress diagnostics and gate ids. */
export function createChannelIngressPluginId(id: string): ChannelIngressPluginId {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error("Channel ingress plugin id must be non-empty.");
  }
  return trimmed as ChannelIngressPluginId;
}

/**
 * Create a channel ingress subject from one or more identifiers.
 * Missing opaque ids are generated deterministically so redacted match output stays stable.
 */
export function createChannelIngressSubject(
  input:
    | ChannelIngressSubjectIdentifierInput
    | { identifiers: readonly ChannelIngressSubjectIdentifierInput[] },
): ChannelIngressSubject {
  const identifiers = "identifiers" in input ? input.identifiers : [input];
  return {
    identifiers: identifiers.map((identifier, index) => ({
      opaqueId: identifier.opaqueId ?? `subject-${index + 1}`,
      kind: identifier.kind ?? "stable-id",
      value: identifier.value,
      dangerous: identifier.dangerous,
      sensitivity: identifier.sensitivity,
    })),
  };
}

/**
 * Create an adapter for channels that match allowlist entries against one normalized string id.
 * Wildcards are preserved as `*`; empty normalized values are omitted from matchable entries.
 */
export function createChannelIngressStringAdapter(
  params: CreateChannelIngressStringAdapterParams = {},
): ChannelIngressAdapter {
  const kind = params.kind ?? "stable-id";
  const normalizeEntry = params.normalizeEntry ?? defaultNormalize;
  const normalizeSubject = params.normalizeSubject ?? normalizeEntry;
  const isWildcardEntry = params.isWildcardEntry ?? ((entry: string) => entry === "*");
  return {
    normalizeEntries({ entries }) {
      const matchable = normalizeStringEntries(entries).flatMap((entry, index) => {
        const value = isWildcardEntry(entry) ? "*" : normalizeMatchValue(entry, normalizeEntry);
        if (!value) {
          return [];
        }
        return [
          {
            opaqueEntryId: params.resolveEntryId?.({ entry, index }) ?? `entry-${index + 1}`,
            kind,
            value,
            dangerous: resolveDangerous(params.dangerous, entry),
            sensitivity: params.sensitivity,
          },
        ];
      });
      return {
        matchable,
        invalid: [],
        disabled: [],
      };
    },
    matchSubject({ subject, entries }) {
      const values = new Set(
        subject.identifiers.flatMap((identifier) => {
          if (identifier.kind !== kind) {
            return [];
          }
          const value = normalizeMatchValue(identifier.value, normalizeSubject);
          return value ? [value] : [];
        }),
      );
      const matchedEntryIds = entries
        .filter((entry) => entry.kind === kind && (entry.value === "*" || values.has(entry.value)))
        .map((entry) => entry.opaqueEntryId);
      return {
        matched: matchedEntryIds.length > 0,
        matchedEntryIds,
      };
    },
  };
}

/**
 * Create an adapter for channels that match one allowlist entry against multiple identifier kinds.
 * This is useful when a channel supports stable ids plus aliases such as email or username.
 */
export function createChannelIngressMultiIdentifierAdapter(
  params: CreateChannelIngressMultiIdentifierAdapterParams,
): ChannelIngressAdapter {
  const getEntryMatchKey = params.getEntryMatchKey ?? defaultIngressMatchKey;
  const getSubjectMatchKeys =
    params.getSubjectMatchKeys ??
    ((identifier: ChannelIngressSubjectIdentifier) => [defaultIngressMatchKey(identifier)]);
  const isWildcardEntry = params.isWildcardEntry ?? ((entry) => entry.value === "*");
  return {
    normalizeEntries({ entries }) {
      return {
        matchable: entries.flatMap((entry, index) => params.normalizeEntry(entry, index)),
        invalid: [],
        disabled: [],
      };
    },
    matchSubject({ subject, entries }) {
      const subjectKeys = new Set(
        subject.identifiers.flatMap((identifier) =>
          getSubjectMatchKeys(identifier).filter((key): key is string => Boolean(key)),
        ),
      );
      const matchedEntryIds = entries
        .filter((entry) => {
          if (isWildcardEntry(entry)) {
            return true;
          }
          const key = getEntryMatchKey(entry);
          return key ? subjectKeys.has(key) : false;
        })
        .map((entry) => entry.opaqueEntryId);
      return {
        matched: matchedEntryIds.length > 0,
        matchedEntryIds,
      };
    },
  };
}

/** Exhaustiveness helper for switch statements over ingress reason codes. */
export function assertNeverChannelIngressReason(reasonCode: never): never {
  throw new Error(`Unhandled channel ingress reason code: ${String(reasonCode)}`);
}

/** Resolve and normalize channel ingress state from SDK input. */
export async function resolveChannelIngressState(
  input: ChannelIngressStateInput,
): Promise<ChannelIngressState> {
  return await resolveChannelIngressStateInternal(input);
}
