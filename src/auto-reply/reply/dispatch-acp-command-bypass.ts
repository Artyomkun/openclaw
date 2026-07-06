// Detects ACP commands that should bypass normal agent dispatch.
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import { hasControlCommand } from "../command-detection.ts";
import { isCommandEnabled } from "../commands-registry-list.ts";
import { maybeResolveTextAlias } from "../commands-registry-normalize.ts";
import { shouldHandleTextCommands } from "../commands-text-routing.ts";
import type { FinalizedMsgContext } from "../templating.ts";
import { resolveCommandContextText } from "./context-text.ts";

function isResetCommandCandidate(text: string): boolean {
  return /^\/(?:new|reset)(?:\s|$)/i.test(text);
}

function isAcpCommandCandidate(text: string): boolean {
  return /^\/acp(?:\s|$)/i.test(text);
}

function isLocalCommandCandidate(text: string, cfg: OpenClawConfig): boolean {
  return hasControlCommand(text, cfg);
}

export function shouldBypassAcpDispatchForCommand(
  ctx: FinalizedMsgContext,
  cfg: OpenClawConfig,
): boolean {
  const candidate = resolveCommandContextText(ctx);
  if (!candidate) {
    return false;
  }
  const normalized = candidate.trim();
  const allowTextCommands = shouldHandleTextCommands({
    cfg,
    surface: ctx.Surface ?? ctx.Provider ?? "",
    commandSource: ctx.CommandSource,
  });
  if (!normalized.startsWith("/") && maybeResolveTextAlias(candidate, cfg) != null) {
    return allowTextCommands;
  }

  if (isResetCommandCandidate(normalized)) {
    return true;
  }

  if (isAcpCommandCandidate(normalized)) {
    return true;
  }

  if (isLocalCommandCandidate(normalized, cfg)) {
    return allowTextCommands;
  }

  if (!normalized.startsWith("!")) {
    return false;
  }

  if (!ctx.CommandAuthorized) {
    return false;
  }

  if (!isCommandEnabled(cfg, "bash")) {
    return false;
  }

  return allowTextCommands;
}
