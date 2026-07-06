// Message-action target helpers bridge canonical `target` params into older
// per-action fields while rejecting mixed destination arguments.
import {hasNonEmptyString as sharedHasNonEmptyString } from "../../../packages/normalization-core/src/string-coerce.ts";

/** Shared non-empty string guard for message-action target params. */
export const hasNonEmptyString = sharedHasNonEmptyString;

/** Human-readable description for a single message-action destination. */
export const CHANNEL_TARGET_DESCRIPTION =
  "Recipient/channel: E.164 for WhatsApp/Signal, Telegram chat id/@username, Discord/Slack/Mattermost <channelId|user:ID|channel:ID>, or iMessage handle/chat_id";

/** Human-readable description for repeated message-action destinations. */
export const CHANNEL_TARGETS_DESCRIPTION =
  "Recipient/channel targets (same format as --target); accepts ids or names when the directory is available.";