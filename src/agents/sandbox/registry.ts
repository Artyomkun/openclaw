/**
 * Persistent sandbox registry storage — Oracle Edition.
 */
import type { Insertable, Selectable, Updateable } from "kysely";
import { z } from "zod";
import oracledb from "oracledb";
import { getOracleKysely } from "../../infra/kysely-oracle.ts";
import type { DB as OpenClawStateKyselyDatabase } from "../../state/openclaw-state-db.generated.ts";
import {
  openOpenClawStateDatabase,
  runOpenClawStateWriteTransaction,
} from "../../state/openclaw-state-db.ts";

// ─── Types ─────────────────────────────────────────────────

export type SandboxRegistryEntry = {
  containerName: string;
  backendId: string;
  runtimeLabel: string;
  sessionKey: string;
  createdAtMs: number;
  lastUsedAtMs: number;
  image: string;
  configLabelKind: string;
  configHash: string;
};

export type SandboxBrowserRegistryEntry = {
  containerName: string;
  sessionKey: string;
  createdAtMs: number;
  lastUsedAtMs: number;
  image: string;
  configHash: string;
  cdpPort: number;
  noVncPort: number;
};

type SandboxRegistryKind = "container" | "browser";
type SandboxRegistryTable = OpenClawStateKyselyDatabase["sandbox_registry_entries"];
type SandboxRegistryDatabase = Pick<OpenClawStateKyselyDatabase, "sandbox_registry_entries">;
type SandboxRegistryRow = Selectable<SandboxRegistryTable>;
type SandboxRegistryInsert = Insertable<SandboxRegistryTable>;
type SandboxRegistryUpdate = Updateable<SandboxRegistryTable>;

// ─── Helpers ───────────────────────────────────────────────

function getSandboxRegistryKysely(db: oracledb.Connection) {
  return getOracleKysely<SandboxRegistryDatabase>(db);
}

function parseRegistryEntryJson(row: SandboxRegistryRow): Record<string, unknown> {
  const parsed = JSON.parse(row.entry_json);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid registry entry JSON for ${row.container_name}`);
  }
  return parsed as Record<string, unknown>;
}

function optionalPayloadString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// ─── Row ↔ Entry Mappers ───────────────────────────────────

function rowToContainerEntry(row: SandboxRegistryRow): SandboxRegistryEntry {
  const payload = parseRegistryEntryJson(row);
  return {
    containerName: row.container_name,
    sessionKey: row.session_key ?? optionalPayloadString(payload.sessionKey),
    createdAtMs: row.created_at_ms ?? Number(payload.createdAtMs ?? 0),
    lastUsedAtMs: row.last_used_at_ms ?? Number(payload.lastUsedAtMs ?? 0),
    image: row.image ?? optionalPayloadString(payload.image),
    backendId: row.backend_id ?? "docker",
    runtimeLabel: row.runtime_label ?? row.container_name,
    configLabelKind: row.config_label_kind ?? "Image",
    configHash: row.config_hash ?? "",
  };
}

function rowToBrowserEntry(row: SandboxRegistryRow): SandboxBrowserRegistryEntry {
  const payload = parseRegistryEntryJson(row);
  return {
    containerName: row.container_name,
    sessionKey: row.session_key ?? optionalPayloadString(payload.sessionKey),
    createdAtMs: row.created_at_ms ?? Number(payload.createdAtMs ?? 0),
    lastUsedAtMs: row.last_used_at_ms ?? Number(payload.lastUsedAtMs ?? 0),
    image: row.image ?? optionalPayloadString(payload.image),
    cdpPort: row.cdp_port ?? Number(payload.cdpPort ?? 0),
    noVncPort: row.no_vnc_port ?? 0,
    configHash: row.config_hash ?? "",
  };
}

function containerEntryToRow(entry: SandboxRegistryEntry, existing: SandboxRegistryEntry | null): SandboxRegistryInsert {
  const next: SandboxRegistryEntry = {
    ...entry,
    backendId: entry.backendId ?? existing?.backendId ?? "docker",
    runtimeLabel: entry.runtimeLabel ?? existing?.runtimeLabel ?? entry.containerName,
    createdAtMs: existing?.createdAtMs ?? entry.createdAtMs,
    image: existing?.image ?? entry.image,
    configLabelKind: entry.configLabelKind ?? existing?.configLabelKind ?? "Image",
    configHash: entry.configHash ?? existing?.configHash ?? "",
  };
  return {
    registry_kind: "container",
    container_name: next.containerName,
    session_key: next.sessionKey,
    backend_id: next.backendId,
    runtime_label: next.runtimeLabel,
    image: next.image,
    created_at_ms: next.createdAtMs,
    last_used_at_ms: next.lastUsedAtMs,
    config_label_kind: next.configLabelKind,
    config_hash: next.configHash,
    cdp_port: null,
    no_vnc_port: null,
    entry_json: JSON.stringify(next),
    updated_at: Date.now(),
  } as SandboxRegistryInsert;
}

function browserEntryToRow(entry: SandboxBrowserRegistryEntry, existing: SandboxBrowserRegistryEntry | null): SandboxRegistryInsert {
  const next: SandboxBrowserRegistryEntry = {
    ...entry,
    createdAtMs: existing?.createdAtMs ?? entry.createdAtMs,
    image: existing?.image ?? entry.image,
    configHash: entry.configHash ?? existing?.configHash ?? "",
  };
  return {
    registry_kind: "browser",
    container_name: next.containerName,
    session_key: next.sessionKey,
    backend_id: null,
    runtime_label: null,
    image: next.image,
    created_at_ms: next.createdAtMs,
    last_used_at_ms: next.lastUsedAtMs,
    config_label_kind: null,
    config_hash: next.configHash,
    cdp_port: next.cdpPort,
    no_vnc_port: next.noVncPort,
    entry_json: JSON.stringify(next),
    updated_at: Date.now(),
  } as SandboxRegistryInsert;
}

// ─── Oracle Query Helpers ──────────────────────────────────

async function readRegistryRows(kind: SandboxRegistryKind): Promise<SandboxRegistryRow[]> {
  const { db } = openOpenClawStateDatabase();
  const stateDb = getSandboxRegistryKysely(db);
  const result = await stateDb
    .selectFrom("sandbox_registry_entries")
    .selectAll()
    .where("registry_kind", "=", kind)
    .orderBy("container_name", "asc")
    .execute();
  return result.rows;
}

async function readRegistryRow(kind: SandboxRegistryKind, containerName: string): Promise<SandboxRegistryRow | null> {
  const { db } = openOpenClawStateDatabase();
  const stateDb = getSandboxRegistryKysely(db);
  const result = await stateDb
    .selectFrom("sandbox_registry_entries")
    .selectAll()
    .where("registry_kind", "=", kind)
    .where("container_name", "=", containerName)
    .limit(1)
    .execute();
  return result.rows[0] ?? null;
}

async function readRegistryRowFromDb(
  db: oracledb.Connection,
  kind: SandboxRegistryKind,
  containerName: string,
): Promise<SandboxRegistryRow | null> {
  const stateDb = getSandboxRegistryKysely(db);
  const result = await stateDb
    .selectFrom("sandbox_registry_entries")
    .selectAll()
    .where("registry_kind", "=", kind)
    .where("container_name", "=", containerName)
    .limit(1)
    .execute();
  return result.rows[0] ?? null;
}

async function insertRegistryRowIfMissing(row: SandboxRegistryInsert): Promise<void> {
  await runOpenClawStateWriteTransaction(async ({ db }) => {
    const stateDb = getSandboxRegistryKysely(db);
    await stateDb
      .insertInto("sandbox_registry_entries")
      .values(row)
      .onConflict((conflict) =>
        conflict.columns(["registry_kind", "container_name"]).doNothing(),
      )
      .execute();
  });
}

async function insertRegistryRow(db: oracledb.Connection, row: SandboxRegistryInsert): Promise<void> {
  const stateDb = getSandboxRegistryKysely(db);
  await stateDb
    .insertInto("sandbox_registry_entries")
    .values(row)
    .onConflict((conflict) =>
      conflict.columns(["registry_kind", "container_name"]).doUpdateSet(
        Object.fromEntries(
          Object.entries(row).filter(([key]) => key !== "registry_kind" && key !== "container_name")
        ) as SandboxRegistryUpdate
      ),
    )
    .execute();
}

async function removeRegistryRow(kind: SandboxRegistryKind, containerName: string): Promise<void> {
  await runOpenClawStateWriteTransaction(async ({ db }) => {
    const stateDb = getSandboxRegistryKysely(db);
    await stateDb
      .deleteFrom("sandbox_registry_entries")
      .where("registry_kind", "=", kind)
      .where("container_name", "=", containerName)
      .execute();
  });
}

// ─── Public API ────────────────────────────────────────────

export async function readRegistryEntry(containerName: string): Promise<SandboxRegistryEntry | null> {
  const row = await readRegistryRow("container", containerName);
  return row ? rowToContainerEntry(row) : null;
}

export async function updateRegistry(entry: SandboxRegistryEntry): Promise<void> {
  await runOpenClawStateWriteTransaction(async ({ db }) => {
    const existingRow = await readRegistryRowFromDb(db, "container", entry.containerName);
    const existing = existingRow ? rowToContainerEntry(existingRow) : null;
    await insertRegistryRow(db, containerEntryToRow(entry, existing));
  });
}

export async function removeRegistryEntry(containerName: string): Promise<void> {
  await removeRegistryRow("container", containerName);
}

export async function readBrowserRegistry(): Promise<{ entries: SandboxBrowserRegistryEntry[] }> {
  const rows = await readRegistryRows("browser");
  return {
    entries: rows
      .map((row) => rowToBrowserEntry(row))
      .filter((entry): entry is SandboxBrowserRegistryEntry => entry != null),
  };
}

export async function updateBrowserRegistry(entry: SandboxBrowserRegistryEntry): Promise<void> {
  await runOpenClawStateWriteTransaction(async ({ db }) => {
    const existingRow = await readRegistryRowFromDb(db, "browser", entry.containerName);
    const existing = existingRow ? rowToBrowserEntry(existingRow) : null;
    await insertRegistryRow(db, browserEntryToRow(entry, existing));
  });
}

export async function removeBrowserRegistryEntry(containerName: string): Promise<void> {
  await removeRegistryRow("browser", containerName);
}