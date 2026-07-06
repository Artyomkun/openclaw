/**
 * Session message conversion bridge from the shared agent-core harness package.
 *
 * Keeping the re-export here gives session code a stable local import path while the
 * canonical message conversion logic lives in the shared package.
 */
export { convertToLlm } from "../../../packages/agent-core/src/harness/messages.ts";

export type {
  BashExecutionMessage,
  BranchSummaryMessage,
  CompactionSummaryMessage,
  CustomMessage,
} from "../../../packages/agent-core/src/harness/messages.ts";
