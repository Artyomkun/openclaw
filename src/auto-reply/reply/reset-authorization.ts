// Resolves whether a sender may reset or restart a reply session.
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { isInternalMessageChannel } from "../../utils/message-channel.ts";
import { resolveCommandAuthorization } from "../command-auth.ts";
import type { MsgContext } from "../templating.ts";

export function isResetAuthorizedForContext(params: {
  ctx: MsgContext;
  cfg: OpenClawConfig;
  commandAuthorized: boolean;
}): boolean {
  const auth = resolveCommandAuthorization(params);
  if (!params.commandAuthorized && !auth.isAuthorizedSender) {
    return false;
  }
  const provider = params.ctx.Provider;
  const internalGatewayCaller = provider
    ? isInternalMessageChannel(provider)
    : isInternalMessageChannel(params.ctx.Surface);
  if (!internalGatewayCaller) {
    return true;
  }
  const scopes = params.ctx.GatewayClientScopes;
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return true;
  }
  return scopes.includes("operator.admin");
}
