// Shared sessions.changed broadcaster for gateway RPC and chat-command mutations.
import { resolveDefaultAgentId } from "../../agents/agent-scope.ts";
import { buildGatewaySessionEventFields } from "../session-event-payload.ts";
import { loadGatewaySessionRow } from "../session-utils.ts";
import { hasTrackedActiveSessionRun } from "./session-active-runs.ts";
import type { GatewayRequestContext } from "./types.ts";

export type SessionChangedPayload = {
  sessionKey?: string;
  agentId?: string;
  reason: string;
  compacted?: boolean;
};

export function emitSessionsChanged(
  context: Pick<
    GatewayRequestContext,
    | "broadcastToConnIds"
    | "chatAbortControllers"
    | "getRuntimeConfig"
    | "getSessionEventSubscriberConnIds"
  >,
  payload: SessionChangedPayload,
) {
  const connIds = context.getSessionEventSubscriberConnIds();
  if (connIds.size === 0) {
    return;
  }
  const sessionRow = payload.sessionKey
    ? loadGatewaySessionRow(
        payload.sessionKey,
        payload.sessionKey === "global" && payload.agentId
          ? { agentId: payload.agentId }
          : undefined,
      )
    : null;
  const defaultAgentId = resolveDefaultAgentId(context.getRuntimeConfig());
  context.broadcastToConnIds(
    "sessions.changed",
    {
      ...payload,
      ts: Date.now(),
      ...(sessionRow
        ? {
            ...buildGatewaySessionEventFields({
              sessionRow,
              agentId: payload.agentId,
              hasActiveRun: hasTrackedActiveSessionRun({
                context,
                requestedKey: payload.sessionKey ?? sessionRow.key,
                canonicalKey: sessionRow.key,
                agentId: sessionRow.key === "global" ? payload.agentId : undefined,
                defaultAgentId,
              }),
            }),
            effectiveFastMode: sessionRow.effectiveFastMode,
            effectiveFastModeSource: sessionRow.effectiveFastModeSource,
            fastAutoOnSeconds: sessionRow.fastAutoOnSeconds,
            traceLevel: sessionRow.traceLevel,
            pluginExtensions: sessionRow.pluginExtensions,
          }
        : {}),
    },
    connIds,
    { dropIfSlow: true },
  );
}
