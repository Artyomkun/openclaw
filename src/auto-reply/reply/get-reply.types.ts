// Shared get-reply type contracts for command, directive, and runtime layers.
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { GetReplyOptions } from "../get-reply-options.types.ts";
import type { ReplyPayload } from "../reply-payload.ts";
import type { MsgContext } from "../templating.ts";

export type ReplySessionBinding = {
  sessionKey?: string;
  sessionId: string;
  storePath?: string;
};

export type InternalReplySessionOptions = {
  requestedSessionId?: string;
  resumeRequestedSession?: boolean;
};

export type InternalGetReplyOptions = GetReplyOptions & InternalReplySessionOptions;

/** Reply resolver signature used by dispatchers and tests for dependency injection. */
export type GetReplyFromConfig = (
  ctx: MsgContext,
  opts?: GetReplyOptions,
  configOverride?: OpenClawConfig,
) => Promise<ReplyPayload | ReplyPayload[] | undefined>;

export type InternalGetReplyFromConfig = (
  ctx: MsgContext,
  opts?: InternalGetReplyOptions,
  configOverride?: OpenClawConfig,
) => Promise<ReplyPayload | ReplyPayload[] | undefined>;
