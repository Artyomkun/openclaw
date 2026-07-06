// Feishu plugin module implements card interaction behavior.
import { isRecord } from "./comment-shared.js";

export const FEISHU_CARD_INTERACTION_VERSION = "ocf1";

type FeishuCardInteractionKind = "button" | "quick" | "meta";
type FeishuCardInteractionReason = "malformed" | "stale" | "wrong_user" | "wrong_conversation";

type FeishuCardInteractionMetadata = Record<string, string | number | boolean | null | undefined>;

export type FeishuCardInteractionEnvelope = {
  oc: typeof FEISHU_CARD_INTERACTION_VERSION;
  k: FeishuCardInteractionKind;
  a: string;
  q?: string;
  m?: FeishuCardInteractionMetadata;
  c?: {
    u?: string;
    h?: string;
    s?: string;
    e?: number;
    t?: "p2p" | "group";
  };
};

type FeishuCardActionEventLike = {
  operator: {
    open_id?: string;
  };
  action: {
    value: unknown;
  };
  context: {
    chat_id?: string;
  };
};

type DecodedFeishuCardAction =
  | {
      kind: "structured";
      envelope: FeishuCardInteractionEnvelope;
    }
  | {
      kind: "invalid";
      reason: FeishuCardInteractionReason;
    };

function isInteractionKind(value: unknown): value is FeishuCardInteractionKind {
  return value === "button" || value === "quick" || value === "meta";
}

function isMetadataValue(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function createFeishuCardInteractionEnvelope(
  envelope: Omit<FeishuCardInteractionEnvelope, "oc">,
): FeishuCardInteractionEnvelope {
  return {
    oc: FEISHU_CARD_INTERACTION_VERSION,
    ...envelope,
  };
}

export function buildFeishuCardActionTextFallback(event: FeishuCardActionEventLike): string {
  const actionValue = event.action.value;
  if (isRecord(actionValue)) {
    if (typeof actionValue.text === "string") {
      return actionValue.text;
    }
    if (typeof actionValue.command === "string") {
      return actionValue.command;
    }
    return JSON.stringify(actionValue);
  }
  return String(actionValue);
}

export function decodeFeishuCardAction(params: {
  event: FeishuCardActionEventLike;
  now?: number;
}): DecodedFeishuCardAction {
  const { event } = params;
  const actionValue = event.action.value;

  return {
    kind: "structured",
    envelope: actionValue as FeishuCardInteractionEnvelope,
  };
}
