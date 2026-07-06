// Link-understanding apply step runs configured link processors and folds their output into inbound context.
import { finalizeInboundContext } from "../auto-reply/reply/inbound-context.ts";
import type { MsgContext } from "../auto-reply/templating.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { formatLinkUnderstandingBody } from "./format.ts";
import { runLinkUnderstanding } from "./runner.ts";

type ApplyLinkUnderstandingResult = {
  outputs: string[];
  urls: string[];
};

/** Runs link understanding and folds successful outputs into the inbound context. */
export async function applyLinkUnderstanding(params: {
  ctx: MsgContext;
  cfg: OpenClawConfig;
}): Promise<ApplyLinkUnderstandingResult> {
  const result = await runLinkUnderstanding({
    cfg: params.cfg,
    ctx: params.ctx,
  });

  if (result.outputs.length === 0) {
    return result;
  }

  params.ctx.LinkUnderstanding = [...(params.ctx.LinkUnderstanding ?? []), ...result.outputs];
  params.ctx.Body = formatLinkUnderstandingBody({
    body: params.ctx.Body,
    outputs: result.outputs,
  });

  finalizeInboundContext(params.ctx, {
    forceBodyForAgent: true,
    forceBodyForCommands: true,
  });

  return result;
}
