// Plugin manifest loader — simplified
import fs from "node:fs";
import path from "node:path";
import { isRecord } from "../utils.ts";
import { parseJsonWithJson5Fallback } from "../utils/parse-json-compat.ts";

export const PLUGIN_MANIFEST_FILENAME = "openclaw.plugin.json";
export const MAX_PLUGIN_MANIFEST_BYTES = 256 * 1024;

export type PluginManifest = {
  id: string;
  configSchema: Record<string, unknown>;
  name?: string;
  version?: string;
  description?: string;
  enabledByDefault?: boolean;
  channels?: string[];
  providers?: string[];
  commands?: string[];
  setup?: {
    providers?: Array<{
      id: string;
      envVars?: string[];
    }>;
  };
};

export type PluginManifestLoadResult =
  | { ok: true; manifest: PluginManifest; manifestPath: string }
  | { ok: false; error: string; manifestPath: string };

export function loadPluginManifest(rootDir: string): PluginManifestLoadResult {
  const manifestPath = path.join(rootDir, PLUGIN_MANIFEST_FILENAME);

  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      error: `Plugin manifest not found: ${manifestPath}`,
      manifestPath,
    };
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    raw = parseJsonWithJson5Fallback(content);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to parse manifest: ${String(err)}`,
      manifestPath,
    };
  }

  if (!isRecord(raw)) {
    return {
      ok: false,
      error: "Manifest must be an object",
      manifestPath,
    };
  }

  const id = String(raw.id ?? "").trim();
  if (!id) {
    return {
      ok: false,
      error: "Manifest requires 'id' field",
      manifestPath,
    };
  }

  const configSchema = isRecord(raw.configSchema) ? raw.configSchema : null;
  if (!configSchema) {
    return {
      ok: false,
      error: "Manifest requires 'configSchema' field",
      manifestPath,
    };
  }

  return {
    ok: true,
    manifest: {
      id,
      configSchema,
      name: String(raw.name ?? "").trim() || undefined,
      version: String(raw.version ?? "").trim() || undefined,
      description: String(raw.description ?? "").trim() || undefined,
      enabledByDefault: raw.enabledByDefault === true,
      channels: normalizeStringList(raw.channels),
      providers: normalizeStringList(raw.providers),
      commands: normalizeStringList(raw.commands),
      setup: normalizeSetup(raw.setup),
    },
    manifestPath,
  };
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((v): v is string => typeof v === "string").map((v) => v.trim());
  return list.length > 0 ? list : undefined;
}

function normalizeSetup(value: unknown): PluginManifest["setup"] {
  if (!isRecord(value)) return undefined;
  const providers = normalizeSetupProviders(value.providers);
  return providers ? { providers } : undefined;
}

function normalizeSetupProviders(value: unknown): PluginManifest["setup"]["providers"] {
  if (!Array.isArray(value)) return undefined;
  const result = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = String(entry.id ?? "").trim();
    if (!id) continue;
    result.push({
      id,
      envVars: normalizeStringList(entry.envVars),
    });
  }
  return result.length > 0 ? result : undefined;
}