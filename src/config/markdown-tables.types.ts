// Defines markdown table config types used by rendering surfaces.
import type { MarkdownTableMode } from "./types.base.ts";
import type { OpenClawConfig } from "./types.openclaw.ts";

/** Parameters for resolving markdown table rendering per config and channel. */
export type ResolveMarkdownTableModeParams = {
  cfg?: Partial<OpenClawConfig>;
  channel?: string | null;
  accountId?: string | null;
  supportsBlockTables?: boolean;
};

export type ResolveMarkdownTableMode = (
  params: ResolveMarkdownTableModeParams,
) => MarkdownTableMode;
