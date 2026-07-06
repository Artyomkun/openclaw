/**
 * Persists, inspects, and refreshes the installed plugin index in the state database.
 */
import { z } from "zod";
import { isBlockedObjectKey } from "../infra/prototype-keys.ts";
import { requireNodeOracle } from "../infra/node-oracle.ts";
import { safeParseWithSchema } from "../utils/zod-parse.ts";
import { resolveCompatibilityHostVersion } from "../version.ts";
import { normalizePluginsConfig, resolveEffectiveEnableState } from "./config-state.ts";
import { isPluginEnabledByDefaultForPlatform } from "./default-enablement.ts";
import { hashJson } from "./installed-plugin-index-hash.ts";
import { resolveCompatRegistryVersion } from "./installed-plugin-index-policy.ts";
import { clearLoadInstalledPluginIndexInstallRecordsCache } from "./installed-plugin-index-record-cache.ts";
import {
  resolveInstalledPluginIndexStorePath,
  type InstalledPluginIndexStoreOptions,
} from "./installed-plugin-index-store-path.ts";
import {
  diffInstalledPluginIndexInvalidationReasons,
  extractPluginInstallRecordsFromInstalledPluginIndex,
  hasMissingConfigPathActivationMetadata,
  INSTALLED_PLUGIN_INDEX_WARNING,
  INSTALLED_PLUGIN_INDEX_VERSION,
  INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
  loadInstalledPluginIndex,
  resolveInstalledPluginIndexPolicyHash,
  refreshInstalledPluginIndex,
  type InstalledPluginIndex,
  type InstalledPluginInstallRecordInfo,
  type InstalledPluginIndexRefreshReason,
  type LoadInstalledPluginIndexParams,
  type RefreshInstalledPluginIndexParams,
} from "./installed-plugin-index.ts";
import { clearPluginMetadataLifecycleCaches } from "./plugin-metadata-lifecycle.ts";

export {
  resolveInstalledPluginIndexStorePath,
  type InstalledPluginIndexStoreOptions,
} from "./installed-plugin-index-store-path.ts";

export type InstalledPluginIndexStoreState = "missing" | "fresh" | "stale";
export type InstalledPluginIndexStoreInspection = {
  state: InstalledPluginIndexStoreState;
  refreshReasons: readonly InstalledPluginIndexRefreshReason[];
  persisted: InstalledPluginIndex | null;
  current: InstalledPluginIndex;
};

const StringArraySchema = z.array(z.string());
const INSTALLED_PLUGIN_INDEX_ORACLE_KEY = "installed-plugin-index";

const InstalledPluginIndexStartupSchema = z.object({
  sidecar: z.boolean(),
  memory: z.boolean(),
  deferConfiguredChannelFullLoadUntilAfterListen: z.boolean(),
  agentHarnesses: StringArraySchema,
  configPaths: StringArraySchema.optional(),
});

const InstalledPluginIndexContributionSchema = z.object({
  channels: StringArraySchema,
  channelConfigs: StringArraySchema,
  providers: StringArraySchema,
  modelCatalogProviders: StringArraySchema,
  modelSupportPrefixes: StringArraySchema,
  modelSupportPatterns: StringArraySchema,
  autoEnableProviderIds: StringArraySchema,
  commandAliases: StringArraySchema,
  contracts: z.record(z.string(), StringArraySchema),
});

const InstalledPluginFileSignatureSchema = z.object({
  size: z.number(),
  mtimeMs: z.number(),
  ctimeMs: z.number().optional(),
});

const InstalledPluginIndexRecordSchema = z.object({
  pluginId: z.string(),
  packageName: z.string().optional(),
  packageVersion: z.string().optional(),
  installRecord: z.record(z.string(), z.unknown()).optional(),
  installRecordHash: z.string().optional(),
  packageInstall: z.unknown().optional(),
  packageChannel: z.unknown().optional(),
  manifestPath: z.string(),
  manifestHash: z.string(),
  manifestFile: InstalledPluginFileSignatureSchema.optional(),
  format: z.string().optional(),
  bundleFormat: z.string().optional(),
  source: z.string().optional(),
  setupSource: z.string().optional(),
  packageJson: z
    .object({
      path: z.string(),
      hash: z.string(),
      fileSignature: InstalledPluginFileSignatureSchema.optional(),
    })
    .optional(),
  rootDir: z.string(),
  origin: z.string(),
  enabled: z.boolean(),
  enabledByDefault: z.boolean().optional(),
  enabledByDefaultOnPlatforms: StringArraySchema.optional(),
  syntheticAuthRefs: StringArraySchema.optional(),
  startup: InstalledPluginIndexStartupSchema,
  contributions: InstalledPluginIndexContributionSchema.optional(),
  compat: z.array(z.string()),
});

const InstalledPluginInstallRecordSchema = z.record(z.string(), z.unknown());

const PluginDiagnosticSchema = z.object({
  level: z.union([z.literal("warn"), z.literal("error")]),
  message: z.string(),
  pluginId: z.string().optional(),
  source: z.string().optional(),
});

const InstalledPluginIndexSchema = z.object({
  version: z.literal(INSTALLED_PLUGIN_INDEX_VERSION),
  warning: z.string().optional(),
  hostContractVersion: z.string(),
  compatRegistryVersion: z.string(),
  migrationVersion: z.literal(INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION),
  policyHash: z.string(),
  generatedAtMs: z.number(),
  refreshReason: z.string().optional(),
  installRecords: z.record(z.string(), InstalledPluginInstallRecordSchema).optional(),
  plugins: z.array(InstalledPluginIndexRecordSchema),
  diagnostics: z.array(PluginDiagnosticSchema),
});

let pool: any = null;

function getPool() {
  if (!pool) {
    const oracledb = requireNodeOracle();
    pool = oracledb.createPool({
      user: process.env.ORACLE_USER || "openclaw",
      password: process.env.ORACLE_PASSWORD || "",
      connectString: process.env.ORACLE_CONNECTION_STRING || "localhost:1521/XEPDB1",
      poolMin: 1,
      poolMax: 10,
    });
  }
  return pool;
}

async function getConnection() {
  return await getPool().getConnection();
}

async function ensureSchema(): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE installed_plugin_index (
          index_key VARCHAR2(128) PRIMARY KEY,
          version NUMBER NOT NULL,
          host_contract_version VARCHAR2(64) NOT NULL,
          compat_registry_version VARCHAR2(64) NOT NULL,
          migration_version NUMBER NOT NULL,
          policy_hash VARCHAR2(64) NOT NULL,
          generated_at_ms NUMBER NOT NULL,
          refresh_reason VARCHAR2(128),
          install_records_json CLOB,
          plugins_json CLOB NOT NULL,
          diagnostics_json CLOB NOT NULL,
          warning CLOB,
          updated_at_ms NUMBER NOT NULL
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_installed_plugin_index_updated ON installed_plugin_index(updated_at_ms)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    await conn.commit();
  } finally {
    await conn.close();
  }
}

function copySafeInstallRecords(
  records: Readonly<Record<string, InstalledPluginInstallRecordInfo>> | undefined,
): Record<string, InstalledPluginInstallRecordInfo> | undefined {
  if (!records) return undefined;
  const safeRecords: Record<string, InstalledPluginInstallRecordInfo> = {};
  for (const [pluginId, record] of Object.entries(records)) {
    if (isBlockedObjectKey(pluginId)) continue;
    safeRecords[pluginId] = record;
  }
  return safeRecords;
}

export function parseInstalledPluginIndex(value: unknown): InstalledPluginIndex | null {
  const parsed = safeParseWithSchema(InstalledPluginIndexSchema, value) as
    | (Omit<InstalledPluginIndex, "installRecords"> & {
        installRecords?: InstalledPluginIndex["installRecords"];
      })
    | null;
  if (!parsed) return null;

  const installRecords =
    copySafeInstallRecords(parsed.installRecords) ??
    copySafeInstallRecords(
      extractPluginInstallRecordsFromInstalledPluginIndex(parsed as InstalledPluginIndex),
    ) ??
    {};

  return {
    version: parsed.version,
    ...(parsed.warning ? { warning: parsed.warning } : {}),
    hostContractVersion: parsed.hostContractVersion,
    compatRegistryVersion: parsed.compatRegistryVersion,
    migrationVersion: parsed.migrationVersion,
    policyHash: parsed.policyHash,
    generatedAtMs: parsed.generatedAtMs,
    ...(parsed.refreshReason ? { refreshReason: parsed.refreshReason } : {}),
    installRecords,
    plugins: parsed.plugins,
    diagnostics: parsed.diagnostics,
  };
}

type InstalledPluginIndexOracleRow = {
  INDEX_KEY: string;
  VERSION: number;
  WARNING: string | null;
  HOST_CONTRACT_VERSION: string;
  COMPAT_REGISTRY_VERSION: string;
  MIGRATION_VERSION: number;
  POLICY_HASH: string;
  GENERATED_AT_MS: number;
  REFRESH_REASON: string | null;
  INSTALL_RECORDS_JSON: string;
  PLUGINS_JSON: string;
  DIAGNOSTICS_JSON: string;
  UPDATED_AT_MS: number;
};

function parseJsonColumn(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseInstalledPluginIndexOracleRow(
  row: InstalledPluginIndexOracleRow | undefined,
): InstalledPluginIndex | null {
  if (!row) return null;
  return parseInstalledPluginIndex({
    version: Number(row.VERSION),
    ...(row.WARNING ? { warning: row.WARNING } : {}),
    hostContractVersion: row.HOST_CONTRACT_VERSION,
    compatRegistryVersion: row.COMPAT_REGISTRY_VERSION,
    migrationVersion: Number(row.MIGRATION_VERSION),
    policyHash: row.POLICY_HASH,
    generatedAtMs: Number(row.GENERATED_AT_MS),
    ...(row.REFRESH_REASON ? { refreshReason: row.REFRESH_REASON } : {}),
    installRecords: parseJsonColumn(row.INSTALL_RECORDS_JSON),
    plugins: parseJsonColumn(row.PLUGINS_JSON),
    diagnostics: parseJsonColumn(row.DIAGNOSTICS_JSON),
  });
}

async function readPersistedInstalledPluginIndexFromOracle(
  options: InstalledPluginIndexStoreOptions = {},
): Promise<InstalledPluginIndex | null> {
  await ensureSchema();
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT index_key, version, host_contract_version, compat_registry_version,
              migration_version, policy_hash, generated_at_ms, refresh_reason,
              install_records_json, plugins_json, diagnostics_json, warning, updated_at_ms
       FROM installed_plugin_index
       WHERE index_key = :index_key`,
      { index_key: INSTALLED_PLUGIN_INDEX_ORACLE_KEY }
    );
    if (result.rows.length === 0) return null;
    return parseInstalledPluginIndexOracleRow(result.rows[0] as InstalledPluginIndexOracleRow);
  } finally {
    await conn.close();
  }
}

async function writePersistedInstalledPluginIndexToOracle(
  index: InstalledPluginIndex,
): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  const persisted = {
    ...index,
    warning: INSTALLED_PLUGIN_INDEX_WARNING,
    installRecords: copySafeInstallRecords(index.installRecords) ?? {},
  };

  const conn = await getConnection();
  try {
    await conn.execute(
      `MERGE INTO installed_plugin_index t
       USING (SELECT :index_key AS index_key FROM DUAL) s
       ON (t.index_key = s.index_key)
       WHEN MATCHED THEN UPDATE SET
         version = :version,
         host_contract_version = :host_contract_version,
         compat_registry_version = :compat_registry_version,
         migration_version = :migration_version,
         policy_hash = :policy_hash,
         generated_at_ms = :generated_at_ms,
         refresh_reason = :refresh_reason,
         install_records_json = :install_records_json,
         plugins_json = :plugins_json,
         diagnostics_json = :diagnostics_json,
         warning = :warning,
         updated_at_ms = :updated_at_ms
       WHEN NOT MATCHED THEN INSERT
         (index_key, version, host_contract_version, compat_registry_version,
          migration_version, policy_hash, generated_at_ms, refresh_reason,
          install_records_json, plugins_json, diagnostics_json, warning, updated_at_ms)
       VALUES
         (:index_key, :version, :host_contract_version, :compat_registry_version,
          :migration_version, :policy_hash, :generated_at_ms, :refresh_reason,
          :install_records_json, :plugins_json, :diagnostics_json, :warning, :updated_at_ms)`,
      {
        index_key: INSTALLED_PLUGIN_INDEX_ORACLE_KEY,
        version: persisted.version,
        host_contract_version: persisted.hostContractVersion,
        compat_registry_version: persisted.compatRegistryVersion,
        migration_version: persisted.migrationVersion,
        policy_hash: persisted.policyHash,
        generated_at_ms: persisted.generatedAtMs,
        refresh_reason: persisted.refreshReason ?? null,
        install_records_json: JSON.stringify(persisted.installRecords),
        plugins_json: JSON.stringify(persisted.plugins),
        diagnostics_json: JSON.stringify(persisted.diagnostics),
        warning: persisted.warning,
        updated_at_ms: now,
      }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function readPersistedInstalledPluginIndex(
  options: InstalledPluginIndexStoreOptions = {},
): Promise<InstalledPluginIndex | null> {
  return await readPersistedInstalledPluginIndexFromOracle(options);
}

export async function writePersistedInstalledPluginIndex(
  index: InstalledPluginIndex,
  options: InstalledPluginIndexStoreOptions = {},
): Promise<string> {
  const filePath = resolveInstalledPluginIndexStorePath(options);
  await writePersistedInstalledPluginIndexToOracle(index, options);
  clearPluginMetadataLifecycleCaches();
  clearLoadInstalledPluginIndexInstallRecordsCache();
  return filePath;
}

function hasPolicyRefreshTargets(
  persisted: InstalledPluginIndex,
  policyPluginIds: readonly string[] | undefined,
): boolean {
  if (!policyPluginIds || policyPluginIds.length === 0) {
    return true;
  }
  const pluginIds = new Set(persisted.plugins.map((plugin) => plugin.pluginId));
  return policyPluginIds.every((pluginId) => pluginIds.has(pluginId));
}

function canRefreshPersistedPolicyState(
  persisted: InstalledPluginIndex | null,
  params: RefreshInstalledPluginIndexParams & InstalledPluginIndexStoreOptions,
): persisted is InstalledPluginIndex {
  if (!persisted || params.reason !== "policy-changed") return false;
  const env = params.env ?? process.env;
  if (
    persisted.version !== INSTALLED_PLUGIN_INDEX_VERSION ||
    persisted.hostContractVersion !== resolveCompatibilityHostVersion(env) ||
    persisted.compatRegistryVersion !== resolveCompatRegistryVersion() ||
    persisted.migrationVersion !== INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION ||
    hasMissingConfigPathActivationMetadata(persisted)
  ) {
    return false;
  }
  if (
    params.installRecords &&
    hashJson(params.installRecords) !== hashJson(persisted.installRecords ?? {})
  ) {
    return false;
  }
  return hasPolicyRefreshTargets(persisted, params.policyPluginIds);
}

async function refreshPersistedPolicyState(
  persisted: InstalledPluginIndex,
  params: RefreshInstalledPluginIndexParams,
): Promise<InstalledPluginIndex> {
  const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
  return {
    ...persisted,
    policyHash: resolveInstalledPluginIndexPolicyHash(params.config),
    generatedAtMs: (params.now?.() ?? new Date()).getTime(),
    refreshReason: params.reason,
    plugins: persisted.plugins.map((plugin) => ({
      ...plugin,
      enabled: resolveEffectiveEnableState({
        id: plugin.pluginId,
        origin: plugin.origin,
        config: normalizedConfig,
        rootConfig: params.config,
        enabledByDefault: isPluginEnabledByDefaultForPlatform(plugin),
    }).enabled,
    })),
  };
}

export async function inspectPersistedInstalledPluginIndex(
  params: LoadInstalledPluginIndexParams & InstalledPluginIndexStoreOptions = {},
): Promise<InstalledPluginIndexStoreInspection> {
  const persisted = await readPersistedInstalledPluginIndex(params);
  const current = loadInstalledPluginIndex({
    ...params,
    installRecords:
      params.installRecords ?? extractPluginInstallRecordsFromInstalledPluginIndex(persisted),
  });

  if (!persisted) {
    return {
      state: "missing",
      refreshReasons: ["missing"],
      persisted: null,
      current,
    };
  }

  const refreshReasons = diffInstalledPluginIndexInvalidationReasons(persisted, current);
  return {
    state: refreshReasons.length > 0 ? "stale" : "fresh",
    refreshReasons,
    persisted,
    current,
  };
}

export async function refreshPersistedInstalledPluginIndex(
  params: RefreshInstalledPluginIndexParams & InstalledPluginIndexStoreOptions,
): Promise<InstalledPluginIndex> {
  const persisted =
    params.reason === "policy-changed" || !params.installRecords
      ? await readPersistedInstalledPluginIndex(params)
      : null;

  if (await canRefreshPersistedPolicyState(persisted, params)) {
    const index = await refreshPersistedPolicyState(persisted, params);
    await writePersistedInstalledPluginIndex(index, params);
    return index;
  }

  const index = refreshInstalledPluginIndex({
    ...params,
    installRecords:
      params.installRecords ?? extractPluginInstallRecordsFromInstalledPluginIndex(persisted),
  });
  await writePersistedInstalledPluginIndex(index, params);
  return index;
}