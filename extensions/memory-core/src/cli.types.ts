/**
 * Memory Core - Types
 */

export type InternalMemoryState = {
  workspaceDir: string;
  agentId: string;
  settings: any;
};

export type InternalRecallEntry = {
  path: string;
  snippet: string;
  count: number;
};