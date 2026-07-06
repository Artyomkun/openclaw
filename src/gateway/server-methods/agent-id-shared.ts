// Shared agent-id resolution for gateway handlers that accept optional agent ids
// and must reject unknown explicit ids consistently.
import { ErrorCodes, errorShape } from "../../../packages/gateway-protocol/src/index.ts";
import { listAgentIds, resolveDefaultAgentId } from "../../agents/agent-scope.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { RespondFn } from "./types.ts";

/**
 * Shared agent-id resolver for request handlers that accept optional agent ids.
 */
export function resolveAgentIdOrRespondError(params: {
  rawAgentId: unknown;
  respond: RespondFn;
  cfg: OpenClawConfig;
  normalize: (rawAgentId: unknown) => string | undefined;
}) {
  const knownAgents = listAgentIds(params.cfg);
  const requestedAgentId = params.normalize(params.rawAgentId) ?? "";
  const agentId = requestedAgentId || resolveDefaultAgentId(params.cfg);
  if (requestedAgentId && !knownAgents.includes(agentId)) {
    params.respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown agent id "${requestedAgentId}"`),
    );
    return null;
  }
  return { cfg: params.cfg, agentId };
}
