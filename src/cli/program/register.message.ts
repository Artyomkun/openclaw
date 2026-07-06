// Message command registration: core send/read/manage actions plus channel-specific admin helpers.
import type { Command } from "commander";
import { formatDocsLink } from "../../../packages/terminal-core/src/links.ts";
import { theme } from "../../../packages/terminal-core/src/theme.ts";
import { formatHelpExamples } from "../help-format.ts";
import type { ProgramContext } from "./context.ts";
import { createMessageCliHelpers } from "./message/helpers.ts";
import { registerMessageBroadcastCommand } from "./message/register.broadcast.ts";
import { registerMessageDiscordAdminCommands } from "./message/register.discord-admin.ts";
import {
  registerMessageEmojiCommands,
  registerMessageStickerCommands,
} from "./message/register.emoji-sticker.ts";
import {
  registerMessagePermissionsCommand,
  registerMessageSearchCommand,
} from "./message/register.permissions-search.ts";
import { registerMessagePinCommands } from "./message/register.pins.ts";
import { registerMessagePollCommand } from "./message/register.poll.ts";
import { registerMessageReactionsCommands } from "./message/register.reactions.ts";
import { registerMessageReadEditDeleteCommands } from "./message/register.read-edit-delete.ts";
import { registerMessageSendCommand } from "./message/register.send.ts";
import { registerMessageThreadCommands } from "./message/register.thread.ts";

/** Register the `message` command group with shared channel option helpers. */
export function registerMessageCommands(program: Command, ctx: ProgramContext) {
  const message = program
    .command("message")
    .description("Send, read, and manage messages and channel actions")
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ['openclaw message send --target +15555550123 --message "Hi"', "Send a text message."],
  [
    'openclaw message send --target +15555550123 --message "Hi" --media photo.jpg',
    "Send a message with media.",
  ],
  [
    'openclaw message poll --channel discord --target channel:123 --poll-question "Snack?" --poll-option Pizza --poll-option Sushi',
    "Create a Discord poll.",
  ],
  [
    'openclaw message react --channel discord --target 123 --message-id 456 --emoji "✅"',
    "React to a message.",
  ],
])}

${theme.muted("Docs:")} ${formatDocsLink("/cli/message", "docs.openclaw.ai/cli/message")}`,
    )
    .action(() => {
      message.help({ error: true });
    });

  const helpers = createMessageCliHelpers(message, ctx.messageChannelOptions);
  registerMessageSendCommand(message, helpers);
  registerMessageBroadcastCommand(message, helpers);
  registerMessagePollCommand(message, helpers);
  registerMessageReactionsCommands(message, helpers);
  registerMessageReadEditDeleteCommands(message, helpers);
  registerMessagePinCommands(message, helpers);
  registerMessagePermissionsCommand(message, helpers);
  registerMessageSearchCommand(message, helpers);
  registerMessageThreadCommands(message, helpers);
  registerMessageEmojiCommands(message, helpers);
  registerMessageStickerCommands(message, helpers);
  registerMessageDiscordAdminCommands(message, helpers);
}
