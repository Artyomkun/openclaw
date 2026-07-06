/** Public hook handler alias exposed to bundled/workspace hook modules. */
export type HookHandler = import("./internal-hook-types.js").InternalHookHandler;

/** Public hook API facade for hook modules that should not import internals directly. */
export type { AgentBootstrapHookContext } from "./internal-hooks.ts";
export {
  createInternalHookEvent as createHookEvent,
  isAgentBootstrapEvent,
} from "./internal-hooks.ts";
