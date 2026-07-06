// Public process helpers for plugins that spawn or probe local commands.

export * from "../process/exec.ts";
export { prepareOomScoreAdjustedSpawn } from "../process/linux-oom-score.ts";
export type { OomScoreAdjustedSpawn, OomWrapOptions } from "../process/linux-oom-score.ts";
