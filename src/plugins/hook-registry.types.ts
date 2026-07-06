// Defines plugin hook registry entry and dispatch types.
import type { PluginHookRegistration as TypedPluginHookRegistration } from "./hook-types.ts";

/** Hook runner registry state for typed plugin hooks. */
export type HookRunnerRegistry = {
  typedHooks: TypedPluginHookRegistration[];
};

/** Global hook runner registry snapshot with plugin load status. */
export type GlobalHookRunnerRegistry = HookRunnerRegistry & {
  plugins: Array<{
    id: string;
    status: "loaded" | "disabled" | "error";
  }>;
};
