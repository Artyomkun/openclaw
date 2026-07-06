// Commands gateway methods expose validated command listing for a resolved
// agent, provider, scope, and argument-detail request.
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateCommandsListParams,
} from "../../../packages/gateway-protocol/src/index.ts";
import { resolveAgentIdOrRespondError } from "./agent-id-shared.ts";
import { buildCommandsListResult } from "./commands-list-result.ts";
import type { GatewayRequestHandlers } from "./types.ts";

export { buildCommandsListResult };

/** Gateway handler for enumerating available chat/native commands. */
export const commandsHandlers: GatewayRequestHandlers = {
  "commands.list": ({ params, respond, context }) => {
    if (!validateCommandsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid commands.list params: ${formatValidationErrors(validateCommandsListParams.errors)}`,
        ),
      );
      return;
    }
    const resolved = resolveAgentIdOrRespondError({
      rawAgentId: params.agentId,
      respond,
      cfg: context.getRuntimeConfig(),
      normalize: (rawAgentId) => (typeof rawAgentId === "string" ? rawAgentId.trim() : undefined),
    });
    if (!resolved) {
      return;
    }
    respond(
      true,
      buildCommandsListResult({
        cfg: resolved.cfg,
        agentId: resolved.agentId,
        provider: params.provider,
        scope: params.scope,
        includeArgs: params.includeArgs,
      }),
      undefined,
    );
  },
};
