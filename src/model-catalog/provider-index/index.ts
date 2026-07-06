// Provider-index public facade for normalized provider discovery metadata.
export { loadOpenClawProviderIndex } from "./load.ts";
export { normalizeOpenClawProviderIndex } from "./normalize.ts";
export type {
  OpenClawProviderIndex,
  OpenClawProviderIndexPluginInstall,
  OpenClawProviderIndexPlugin,
  OpenClawProviderIndexProviderAuthChoice,
  OpenClawProviderIndexProvider,
} from "./types.ts";
