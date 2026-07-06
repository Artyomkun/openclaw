// Session chat type helpers classify chat surfaces from session metadata.
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import {
  deriveSessionChatTypeFromKey,
  type SessionKeyChatType,
} from "./session-chat-type-shared.ts";
import { parseAgentSessionKey } from "./session-key-utils.ts";

export {
  deriveSessionChatTypeFromKey,
  type SessionKeyChatType,
} from "./session-chat-type-shared.ts";

function resolveScopedSessionKey(sessionKey: string | undefined | null): string {
  const raw = normalizeLowercaseStringOrEmpty(sessionKey);
  if (!raw) {
    return "";
  }
  return parseAgentSessionKey(raw)?.rest ?? raw;
}

export function deriveSessionChatType(sessionKey: string | undefined | null): SessionKeyChatType {
  const builtInType = deriveSessionChatTypeFromKey(sessionKey);
  if (builtInType !== "unknown") {
    return builtInType;
  }
  const scopedSessionKey = resolveScopedSessionKey(sessionKey);
  if (scopedSessionKey) {
    const derived = deriveSessionChatTypeFromKey(scopedSessionKey);
    if (derived !== "unknown") {
      return derived;
    }
  }
  return "unknown";
}
