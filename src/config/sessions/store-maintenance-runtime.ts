// Runtime maintenance config reads current config and falls back for narrow helpers/tests.
import { getRuntimeConfig } from "../config.ts";
import type { SessionMaintenanceConfig } from "../types.base.ts";
import {
  resolveMaintenanceConfigFromInput,
  type ResolvedSessionMaintenanceConfig,
} from "./store-maintenance.ts";

export function resolveMaintenanceConfig(): ResolvedSessionMaintenanceConfig {
  let maintenance: SessionMaintenanceConfig | undefined;
  try {
    maintenance = getRuntimeConfig().session?.maintenance;
  } catch {
    // Config may not be available in narrow test/runtime helpers.
  }
  return resolveMaintenanceConfigFromInput(maintenance);
}
