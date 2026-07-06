import type { PluginLogger } from "../plugins/types.ts";

export const quietPluginJsonLogger: PluginLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
