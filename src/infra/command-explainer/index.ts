// Public command explainer facade for parsing shell commands and formatting approval spans.
export { explainShellCommand } from "./extract.ts";
export { formatCommandSpans } from "./format.ts";
export type {
  CommandContext,
  CommandExplanation,
  CommandRisk,
  CommandShape,
  CommandStep,
  SourceSpan,
} from "./types.ts";
