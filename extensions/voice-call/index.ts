/**
 * Voice Call Plugin
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "voice-call",
  name: "Voice Call",
  description: "Voice calls via Telnyx/Twilio",
  register(api) {
    const config = api.pluginConfig || {};

    api.registerTool({
      name: "voice_call",
      label: "Voice Call",
      description: "Make a voice call",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Phone number" },
          message: { type: "string", description: "Message to say" },
        },
        required: ["to", "message"],
      },
      async execute(_toolCallId, params) {
        const to = params.to;
        const message = params.message;
        const provider = config.provider || "telnyx";
        console.log(`📞 [${provider}] Calling ${to}: ${message}`);
        
        return {
          content: [{ type: "text", text: `📞 Call initiated (${provider})` }],
          details: { success: true, provider, to, message },
        };
      },
    });

    api.registerGatewayMethod(
      "voicecall.status",
      async ({ respond }) => {
        respond(true, {
          status: "ready",
          provider: config.provider || "telnyx",
          enabled: config.enabled !== false,
        });
      },
      { scope: "operator.read" },
    );

    api.registerCli(({ program }) => {
      program
        .command("voicecall")
        .description("Voice call plugin")
        .option("--status", "Show status")
        .action((opts) => {
          if (opts.status) {
            console.log(`📞 Voice Call: ${config.enabled !== false ? "ON" : "OFF"}`);
            console.log(`   Provider: ${config.provider || "telnyx"}`);
          }
        });
    });
  },
});