/** Resolve the channel-specific markdown table rendering mode from config defaults. */
export { resolveMarkdownTableMode } from "../config/markdown-tables.ts";

/** Convert markdown tables using the resolved channel mode before message delivery. */
export { convertMarkdownTables } from "../../packages/markdown-core/src/tables.ts";

/** Public markdown table conversion mode accepted by config and channel helpers. */
export type { MarkdownTableMode } from "../config/types.base.ts";
