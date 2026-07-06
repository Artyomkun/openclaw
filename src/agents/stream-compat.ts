/**
 * Mutable assistant stream compatibility types.
 *
 * Shared by wrappers that decorate async iteration and final result resolution without changing providers.
 */
import type { AssistantMessage, AssistantMessageEvent } from "../llm/types.ts";

export interface MutableAssistantMessageEventStream extends AsyncIterable<AssistantMessageEvent> {
  result: () => Promise<AssistantMessage>;
}
