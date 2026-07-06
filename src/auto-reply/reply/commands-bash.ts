// Implements bash command execution, approval, and stop handling.
import { resolveSessionAgentId } from "../../agents/agent-scope.ts";
import { handleBashChatCommand } from "./bash-command.ts";
import { rejectUnauthorizedCommand } from "./command-gates.ts";
import type { CommandHandler } from "./commands-types.ts";

export const handleBashCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const { command } = params;
  const bashSlashRequested =
    command.commandBodyNormalized === "/bash" || command.commandBodyNormalized.startsWith("/bash ");
  const bashBangRequested = command.commandBodyNormalized.startsWith("!");
  if (!bashSlashRequested && !(bashBangRequested && command.isAuthorizedSender)) {
    return null;
  }
  const unauthorized = rejectUnauthorizedCommand(params, "/bash");
  if (unauthorized) {
    return unauthorized;
  }
  const agentId = params.sessionKey
    ? resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg })
    : params.agentId;
  const reply = await handleBashChatCommand({
    ctx: params.ctx,
    cfg: params.cfg,
    agentId,
    sessionKey: params.sessionKey,
    isGroup: params.isGroup,
    elevated: params.elevated,
  });
  return { shouldContinue: false, reply };
};
