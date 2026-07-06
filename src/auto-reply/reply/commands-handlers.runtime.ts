// Loads command handlers behind a runtime boundary for the command dispatcher.
import { handleAcpCommand } from "./commands-acp.ts";
import { handleAllowlistCommand } from "./commands-allowlist.ts";
import { handleApproveCommand } from "./commands-approve.ts";
import { handleBashCommand } from "./commands-bash.ts";
import { handleBtwCommand } from "./commands-btw.ts";
import { handleCompactCommand } from "./commands-compact.ts";
import { handleConfigCommand, handleDebugCommand } from "./commands-config.ts";
import { handleContextCommand } from "./commands-context-command.ts";
import { handleCrestodianCommand } from "./commands-crestodian.ts";
import { handleDiagnosticsCommand } from "./commands-diagnostics.ts";
import { handleDockCommand } from "./commands-dock.ts";
import { handleGoalCommand } from "./commands-goal.ts";
import {
  handleCommandsListCommand,
  handleExportTrajectoryCommand,
  handleExportSessionCommand,
  handleHelpCommand,
  handleSkillCommandUsage,
  handleStatusCommand,
  handleToolsCommand,
} from "./commands-info.ts";
import { handleMcpCommand } from "./commands-mcp.ts";
import { handleModelsCommand } from "./commands-models.ts";
import { handleNameCommand } from "./commands-name.ts";
import { handlePluginCommand } from "./commands-plugin.ts";
import { handlePluginsCommand } from "./commands-plugins.ts";
import {
  handleAbortTrigger,
  handleActivationCommand,
  handleFastCommand,
  handleRestartCommand,
  handleSendPolicyCommand,
  handleSessionCommand,
  handleStopCommand,
  handleUsageCommand,
} from "./commands-session.ts";
import { handleSteerCommand } from "./commands-steer.ts";
import { handleSubagentsCommand } from "./commands-subagents.ts";
import { handleTasksCommand } from "./commands-tasks.ts";
import { handleTtsCommands } from "./commands-tts.ts";
import type { CommandHandler } from "./commands-types.ts";
import { handleWhoamiCommand } from "./commands-whoami.ts";

export function loadCommandHandlers(): CommandHandler[] {
  return [
    handlePluginCommand,
    handleDockCommand,
    handleBtwCommand,
    handleBashCommand,
    handleActivationCommand,
    handleSendPolicyCommand,
    handleFastCommand,
    handleUsageCommand,
    handleSessionCommand,
    handleRestartCommand,
    handleTtsCommands,
    handleHelpCommand,
    handleCommandsListCommand,
    // Keep deterministic /skill usage on the native command path before the
    // broader tool/status handlers can fall through to an agent run.
    handleSkillCommandUsage,
    handleToolsCommand,
    handleStatusCommand,
    handleGoalCommand,
    handleNameCommand,
    handleDiagnosticsCommand,
    handleTasksCommand,
    handleSteerCommand,
    handleAllowlistCommand,
    handleApproveCommand,
    handleContextCommand,
    handleExportSessionCommand,
    handleExportTrajectoryCommand,
    handleWhoamiCommand,
    handleCrestodianCommand,
    handleSubagentsCommand,
    handleAcpCommand,
    handleMcpCommand,
    handlePluginsCommand,
    handleConfigCommand,
    handleDebugCommand,
    handleModelsCommand,
    handleStopCommand,
    handleCompactCommand,
    handleAbortTrigger,
  ];
}
