/**
 * Memory Core - Dreaming Command
 * 
 * Простая команда для управления dreaming.
 * БЕЗ ГЛОБУСОВ!
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import type { OpenClawPluginApi, PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";

const USAGE = `Usage: /dreaming status | on | off

Dreaming status:
- enabled: shows current state
- sweep cadence: shows frequency
- promotion policy: shows thresholds

Phases:
- light -> REM -> deep (each sweep)
- deep writes to MEMORY.md
- DREAMS.md for human-readable summaries`;

export async function handleDreamingCommand(
  api: OpenClawPluginApi,
  ctx: PluginCommandContext
): Promise<{ text: string }> {
  const args = ctx.args?.trim()?.split(/\s+/) ?? [];
  const cmd = args[0]?.toLowerCase();
  const cfg = api.runtime.config.current() as OpenClawConfig;
  const pluginConfig = (cfg.plugins?.entries?.["memory-core"]?.config as any) || {};
  const dreaming = pluginConfig.dreaming || {};

  if (!cmd || cmd === "help" || cmd === "status") {
    const status = [
      `Dreaming enabled: ${dreaming.enabled !== false ? "✅" : "❌"}`,
      `Frequency: ${dreaming.frequency || "daily"}`,
      `Timezone: ${dreaming.timezone || "UTC"}`,
      `Promotion threshold: ${dreaming.minScore || 0.75}`,
      `Min recalls: ${dreaming.minRecallCount || 3}`,
      `Min unique queries: ${dreaming.minUniqueQueries || 2}`,
    ].join("\n");

    return { text: cmd === "status" ? status : `${USAGE}\n\n${status}` };
  }

  if (cmd === "on" || cmd === "off") {
    if (!ctx.gatewayClientScopes?.includes("operator.admin")) {
      return { text: "⚠️ operator.admin required to change dreaming state" };
    }

    const enabled = cmd === "on";

    await api.runtime.config.mutateConfigFile({
      afterWrite: { mode: "auto" },
      mutate: (draft) => {
        const entries = { ...draft.plugins?.entries };
        const entry = { ...(entries["memory-core"] || {}) };
        const config = { ...(entry.config || {}) };
        config.dreaming = { ...(config.dreaming || {}), enabled };
        entry.config = config;
        entries["memory-core"] = entry;
        draft.plugins = { ...draft.plugins, entries };
      },
    });

    return { text: `Dreaming ${enabled ? "enabled" : "disabled"} ✅` };
  }

  // Если команда неизвестна
  return { text: USAGE };
}