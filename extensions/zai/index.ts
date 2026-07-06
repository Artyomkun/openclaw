/**
 * ZAI Provider
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "zai",
  name: "Z.AI Provider",
  description: "Bundled Z.AI provider plugin",
  register(api) {
    api.registerProvider({
      id: "zai",
      label: "Z.AI",
      aliases: ["z-ai", "z.ai"],
      envVars: ["ZAI_API_KEY", "Z_AI_API_KEY"],
      auth: [{
        id: "api-key",
        label: "Z.AI API key",
        kind: "api_key",
        run: async (ctx) => {
          const apiKey = await ctx.prompter.input({
            message: "Enter Z.AI API key",
            validate: (v) => v.trim() ? true : "API key required",
          });
          return {
            profiles: [{
              profileId: "zai:default",
              credential: { type: "api_key", provider: "zai", key: apiKey },
            }],
            configPatch: { provider: "zai", baseUrl: "https://api.z.ai" },
            defaultModel: "zai/glm-4.7",
          };
        },
      }],
      wrapStreamFn: (ctx) => ctx.streamFn,
    });
  },
});