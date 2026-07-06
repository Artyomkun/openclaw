/**
 * Runtime SDK subpath for registering and watching channel runtime contexts.
 */
export {
  getChannelRuntimeContext,
  registerChannelRuntimeContext,
  watchChannelRuntimeContexts,
} from "../infra/channel-runtime-context.ts";
export type { ChannelRuntimeContextKey } from "../channels/plugins/channel-runtime-surface.types.ts";
