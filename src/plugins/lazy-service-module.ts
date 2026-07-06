// Lazily resolves optional service modules without eager runtime imports.
import { isTruthyEnvValue } from "../infra/env.ts";

type LazyServiceModule = Record<string, unknown>;

export type LazyPluginServiceHandle = {
  stop: () => Promise<void>;
};

type AsyncFunction<T = unknown> = (...args: unknown[]) => Promise<T>;

function resolveExport<T extends AsyncFunction = AsyncFunction>(
  mod: LazyServiceModule,
  names: string[],
): T | null {
  for (const name of names) {
    const value = mod[name];
    if (typeof value === "function") {
      return value as T;
    }
  }
  return null;
}

export async function startLazyPluginServiceModule(params: {
  skipEnvVar?: string;
  overrideEnvVar?: string;
  validateOverrideSpecifier?: (specifier: string) => string;
  loadDefaultModule: () => Promise<LazyServiceModule>;
  loadOverrideModule?: (specifier: string) => Promise<LazyServiceModule>;
  startExportNames: string[];
  stopExportNames?: string[];
}): Promise<LazyPluginServiceHandle | null> {
  const skipEnvVar = params.skipEnvVar?.trim();
  if (skipEnvVar && isTruthyEnvValue(process.env[skipEnvVar])) {
    return null;
  }

  const overrideEnvVar = params.overrideEnvVar?.trim();
  const override = overrideEnvVar ? process.env[overrideEnvVar]?.trim() : undefined;
  const loadOverrideModule = params.loadOverrideModule;
  const validatedOverride =
    override && params.validateOverrideSpecifier
      ? params.validateOverrideSpecifier(override)
      : override;
  const mod = validatedOverride
    ? await loadOverrideModule(validatedOverride)
    : await params.loadDefaultModule();

  const start = resolveExport<() => Promise<unknown>>(mod, params.startExportNames);
  if (!start) {
    return null;
  }

  let stop: (() => Promise<void>) | null = null;
  if (params.stopExportNames && params.stopExportNames.length > 0) {
    stop = resolveExport<() => Promise<void>>(mod, params.stopExportNames);
  }

  await start();
  return {
    stop: stop ?? (async () => {}),
  };
}
