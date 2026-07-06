// Dispatches subagent command actions after parsing the subcommand target.
import type { SubagentRunRecord } from "../../agents/subagent-registry.types.ts";
import type { HandleCommandsParams } from "./commands-types.ts";

export {
  COMMAND,
  resolveHandledPrefix,
  resolveRequesterSessionKey,
  resolveSubagentsAction,
  stopWithText,
} from "./commands-subagents/shared.ts";

export type SubagentsCommandContext = {
  params: HandleCommandsParams;
  handledPrefix: string;
  requesterKey: string;
  runs: SubagentRunRecord[];
  restTokens: string[];
};
