/**
 * Telegram Plugin - Monitor
 */

import { Bot, webhookCallback } from "grammy";
import { createServer } from "node:http";

export async function monitorTelegramProvider(opts: any) {
  try {
    const bot = new Bot(opts.token);
    bot.on("message", async (ctx) => {
      const from = ctx.from?.id;
      const username = ctx.from?.username || "unknown";
      const chatId = ctx.chat?.id;
      const text = ctx.message?.text || "[non-text]";
      
      console.log(`[telegram] [${chatId}] ${username} (${from}): ${text}`);
    });

    bot.on("callback_query", async (ctx) => {
      const from = ctx.from?.id;
      const data = ctx.callbackQuery.data;
      console.log(`[telegram] [callback] ${from}: ${data}`);
      await ctx.answerCallbackQuery();
    });

    if (opts.useWebhook) {
      const port = opts.webhookPort || 8080;
      const path = opts.webhookPath || "/webhook";
      
      const server = createServer(webhookCallback(bot, "node-http"));
      
      await new Promise<void>((resolve, reject) => {
        server.listen(port, () => {
          console.log(`[telegram] Webhook listening on port ${port}${path}`);
          resolve();
        });
        server.on("error", reject);
      });

      console.log(`[telegram] Webhook URL: http://localhost:${port}${path}`);
      await new Promise(() => {});
      
    } else {
      console.log("[telegram] Starting polling monitor...");
      await bot.start({
        allowed_updates: ["message", "callback_query"],
        onStart: (botInfo) => {
          console.log(`[telegram] Monitor @${botInfo.username} started (READ-ONLY MODE)`);
        },
      });
    }

  } catch (err) {
    console.error(`[telegram] Monitor failed: ${err}`);
    throw err;
  }
}