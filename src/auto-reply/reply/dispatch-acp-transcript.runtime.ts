// Bridges ACP transcript events into persisted OpenClaw session transcripts.
import { resolveAcpSessionCwd } from "@openclaw/acp-core/runtime/session-identifiers";
import { resolveSessionAgentId } from "../../agents/agent-scope.ts";
import { persistAcpTurnTranscript } from "../../agents/command/attempt-execution.ts";
import {
  loadSessionStore,
  resolveSessionStoreEntry,
  resolveStorePath,
} from "../../config/sessions.ts";
import type { SessionAcpMeta } from "../../config/sessions/types.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";

export async function persistAcpDispatchTranscript(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  promptText: string;
  finalText: string;
  meta?: SessionAcpMeta;
  threadId?: string | number;
}): Promise<void> {
  const promptText = params.promptText.trim();
  const finalText = params.finalText.trim();
  if (!promptText && !finalText) {
    return;
  }

  const sessionAgentId = resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: params.cfg,
  });
  const storePath = resolveStorePath(params.cfg.session?.store, {
    agentId: sessionAgentId,
  });
  const sessionStore = loadSessionStore(storePath, { skipCache: true });
  const sessionEntry = resolveSessionStoreEntry({
    store: sessionStore,
    sessionKey: params.sessionKey,
  }).existing;
  const sessionId = sessionEntry?.sessionId;
  if (!sessionId) {
    throw new Error(`unknown ACP session key: ${params.sessionKey}`);
  }

  await persistAcpTurnTranscript({
    body: promptText,
    transcriptBody: promptText,
    finalText,
    sessionId,
    sessionKey: params.sessionKey,
    sessionEntry,
    sessionStore,
    storePath,
    sessionAgentId,
    threadId: params.threadId,
    sessionCwd: resolveAcpSessionCwd(params.meta) ?? process.cwd(),
    config: params.cfg,
  });
}
