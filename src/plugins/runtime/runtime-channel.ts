// Runtime channel helpers adapt channel plugin APIs into core channel send and reply flows.
import { convertMarkdownTables } from "../../../packages/markdown-core/src/tables.ts";
import { resolveEffectiveMessagesConfig, resolveHumanDelayConfig } from "../../agents/identity.ts";
import {
  chunkByNewline,
  chunkMarkdownText,
  chunkMarkdownTextWithMode,
  chunkText,
  chunkTextWithMode,
  resolveChunkMode,
  resolveTextChunkLimit,
} from "../../auto-reply/chunk.ts";
import {
  hasControlCommand,
  isControlCommandMessage,
  shouldComputeCommandAuthorized,
} from "../../auto-reply/command-detection.ts";
import { shouldHandleTextCommands } from "../../auto-reply/commands-registry.ts";
import { settleReplyDispatcher, withReplyDispatcher } from "../../auto-reply/dispatch.ts";
import {
  formatAgentEnvelope,
  formatInboundEnvelope,
  resolveEnvelopeFormatOptions,
} from "../../auto-reply/envelope.ts";
import {
  createInboundDebouncer,
  resolveInboundDebounceMs,
} from "../../auto-reply/inbound-debounce.ts";
import { dispatchReplyFromConfig } from "../../auto-reply/reply/dispatch-from-config.ts";
import { finalizeInboundContext } from "../../auto-reply/reply/inbound-context.ts";
import {
  buildMentionRegexes,
  matchesMentionPatterns,
  matchesMentionWithExplicit,
} from "../../auto-reply/reply/mentions.ts";
import { dispatchReplyWithBufferedBlockDispatcher } from "../../auto-reply/reply/provider-dispatcher.ts";
import { createReplyDispatcherWithTyping } from "../../auto-reply/reply/reply-dispatcher.ts";
import {
  createAckReactionHandle,
  removeAckReactionAfterReply,
  removeAckReactionHandleAfterReply,
  shouldAckReaction,
} from "../../channels/ack-reactions.ts";
import { resolveCommandAuthorizedFromAuthorizers } from "../../channels/command-gating.ts";
import { buildChannelInboundEventContext } from "../../channels/inbound-event/context.ts";
import {
  implicitMentionKindWhen,
  resolveInboundMentionDecision,
} from "../../channels/mention-gating.ts";
import {
  setChannelConversationBindingIdleTimeoutBySessionKey,
  setChannelConversationBindingMaxAgeBySessionKey,
} from "../../channels/plugins/conversation-bindings.ts";
import { loadChannelOutboundAdapter } from "../../channels/plugins/outbound/load.ts";
import { recordInboundSession } from "../../channels/session.ts";
import {
  dispatchChannelInboundReply,
  runChannelInboundEvent,
  runPreparedInboundReply,
} from "../../channels/turn/kernel.ts";
import {
  resolveChannelGroupPolicy,
  resolveChannelGroupRequireMention,
} from "../../config/group-policy.ts";
import { resolveMarkdownTableMode } from "../../config/markdown-tables.ts";
import {
  recordSessionMetaFromInbound,
  resolveStorePath,
  updateLastRoute,
} from "../../config/sessions.ts";
import { resolveSessionEntryResetFreshness } from "../../config/sessions/entry-freshness.ts";
import { readSessionUpdatedAt } from "../../config/sessions/session-accessor.ts";
import { getChannelActivity, recordChannelActivity } from "../../infra/channel-activity.ts";
import {
  fetchRemoteMedia,
  readRemoteMediaBuffer,
  saveRemoteMedia,
  saveResponseMedia,
} from "../../media/fetch.ts";
import { saveMediaBuffer } from "../../media/store.ts";
import { buildPairingReply } from "../../pairing/pairing-messages.ts";
import {
  readChannelAllowFromStore,
  upsertChannelPairingRequest,
} from "../../pairing/pairing-store.ts";
import { buildAgentSessionKey, resolveAgentRoute } from "../../routing/resolve-route.ts";
import { createChannelRuntimeContextRegistry } from "./channel-runtime-contexts.ts";
import type { PluginRuntime } from "./types.ts";

export function createRuntimeChannel(): PluginRuntime["channel"] {
  const sessionRuntime = {
    resolveStorePath,
    readSessionUpdatedAt,
    recordSessionMetaFromInbound,
    recordInboundSession,
    updateLastRoute,
    resolveEntryResetFreshness: resolveSessionEntryResetFreshness,
  };
  const channelRuntime = {
    text: {
      chunkByNewline,
      chunkMarkdownText,
      chunkMarkdownTextWithMode,
      chunkText,
      chunkTextWithMode,
      resolveChunkMode,
      resolveTextChunkLimit,
      hasControlCommand,
      resolveMarkdownTableMode,
      convertMarkdownTables,
    },
    reply: {
      dispatchReplyWithBufferedBlockDispatcher,
      createReplyDispatcherWithTyping,
      resolveEffectiveMessagesConfig,
      resolveHumanDelayConfig,
      dispatchReplyFromConfig,
      withReplyDispatcher,
      settleReplyDispatcher,
      finalizeInboundContext,
      formatAgentEnvelope,
      resolveEnvelopeFormatOptions,
    },
    routing: {
      buildAgentSessionKey,
      resolveAgentRoute,
    },
    pairing: {
      buildPairingReply,
      readAllowFromStore: ({ channel, accountId, env }) =>
        readChannelAllowFromStore(channel, env, accountId),
      upsertPairingRequest: ({ channel, id, accountId, meta, env, pairingAdapter }) =>
        upsertChannelPairingRequest({
          channel,
          id,
          accountId,
          meta,
          env,
          pairingAdapter,
        }),
    },
    media: {
      readRemoteMediaBuffer,
      fetchRemoteMedia,
      saveRemoteMedia,
      saveResponseMedia,
      saveMediaBuffer,
    },
    activity: {
      record: recordChannelActivity,
      get: getChannelActivity,
    },
    session: sessionRuntime,
    mentions: {
      buildMentionRegexes,
      matchesMentionPatterns,
      matchesMentionWithExplicit,
      implicitMentionKindWhen,
      resolveInboundMentionDecision,
    },
    reactions: {
      createAckReactionHandle,
      shouldAckReaction,
      removeAckReactionAfterReply,
      removeAckReactionHandleAfterReply,
    },
    groups: {
      resolveGroupPolicy: resolveChannelGroupPolicy,
      resolveRequireMention: resolveChannelGroupRequireMention,
    },
    debounce: {
      createInboundDebouncer,
      resolveInboundDebounceMs,
    },
    commands: {
      resolveCommandAuthorizedFromAuthorizers,
      isControlCommandMessage,
      shouldComputeCommandAuthorized,
      shouldHandleTextCommands,
    },
    outbound: {
      loadAdapter: loadChannelOutboundAdapter,
    },
    inbound: {
      buildContext: buildChannelInboundEventContext,
      run: runChannelInboundEvent,
      runPreparedReply: runPreparedInboundReply,
      dispatchReply: dispatchChannelInboundReply,
    },
    threadBindings: {
      setIdleTimeoutBySessionKey: ({ channelId, targetSessionKey, accountId, idleTimeoutMs }) =>
        setChannelConversationBindingIdleTimeoutBySessionKey({
          channelId,
          targetSessionKey,
          accountId,
          idleTimeoutMs,
        }),
      setMaxAgeBySessionKey: ({ channelId, targetSessionKey, accountId, maxAgeMs }) =>
        setChannelConversationBindingMaxAgeBySessionKey({
          channelId,
          targetSessionKey,
          accountId,
          maxAgeMs,
        }),
    },
    runtimeContexts: createChannelRuntimeContextRegistry(),
  } satisfies PluginRuntime["channel"];

  return channelRuntime as PluginRuntime["channel"];
}
