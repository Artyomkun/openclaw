/**
 * Memory Core - Flush Plan
 */

export function buildMemoryFlushPlan(params: {
  cfg?: any;
  nowMs?: number;
}): any {
  const now = new Date(params.nowMs || Date.now());
  const date = now.toISOString().slice(0, 10);
  const defaults = params.cfg?.agents?.defaults?.compaction?.memoryFlush;
  if (defaults?.enabled === false) {
    return null;
  }
  return {
    softThresholdTokens: defaults?.softThresholdTokens || 4000,
    forceFlushTranscriptBytes: defaults?.forceFlushTranscriptBytes || 2 * 1024 * 1024,
    reserveTokensFloor: params.cfg?.agents?.defaults?.compaction?.reserveTokensFloor || 1000,
    model: defaults?.model?.trim(),
    relativePath: `memory/${date}.md`,
    prompt: defaults?.prompt || `Save memories to memory/${date}.md.`,
    systemPrompt: defaults?.systemPrompt || 'Memory flush turn.',
  };
}