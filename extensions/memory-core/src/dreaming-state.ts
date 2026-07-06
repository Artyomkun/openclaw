/**
 * Memory Core - Dreaming State
 */

import { createHash } from "node:crypto";
import path from "node:path";

export const MEMORY_CORE_PLUGIN_ID = "memory-core";
export const DREAMING_DAILY_INGESTION_NAMESPACE = "dreaming-daily-ingestion";
export const SHORT_TERM_RECALL_NAMESPACE = "short-term-recall";
export const SHORT_TERM_LOCK_NAMESPACE = "short-term-locks";

let store: any = null;

export function configureMemoryCoreDreamingState(openKeyedStore: any): void {
  store = openKeyedStore;
}

function getStore(namespace: string): any {
  if (!store) {
    throw new Error("Memory Core state store not configured");
  }
  return store({ namespace, maxEntries: 50000 });
}

function getWorkspaceKey(workspaceDir: string): string {
  const resolved = path.resolve(workspaceDir).replace(/\\/g, "/");
  const normalized = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  return createHash("sha256").update(normalized).digest("hex");
}

function getEntryKey(workspaceDir: string, key: string): string {
  return `${getWorkspaceKey(workspaceDir)}:${createHash("sha256").update(key).digest("hex")}`;
}

export async function readMemoryCoreWorkspaceEntries(params: {
  namespace: string;
  workspaceDir: string;
}): Promise<Array<{ key: string; value: any }>> {
  const store = getStore(params.namespace);
  const prefix = `${getWorkspaceKey(params.workspaceDir)}:`;
  const entries = await store.entries();
  
  return entries
    .filter((e: any) => e.key.startsWith(prefix))
    .map((e: any) => ({ key: e.value.key, value: e.value.value }));
}

export async function writeMemoryCoreWorkspaceEntries(params: {
  namespace: string;
  workspaceDir: string;
  entries: Array<{ key: string; value: any }>;
}): Promise<void> {
  const store = getStore(params.namespace);
  const workspaceKey = getWorkspaceKey(params.workspaceDir);
  const prefix = `${workspaceKey}:`;

  for (const entry of params.entries) {
    await store.register(getEntryKey(params.workspaceDir, entry.key), {
      version: 1,
      workspaceKey,
      workspaceDir: path.resolve(params.workspaceDir),
      key: entry.key,
      value: entry.value,
    });
  }

  const existing = await store.entries();
  for (const e of existing) {
    if (e.key.startsWith(prefix)) {
      await store.delete(e.key);
    }
  }
}

export async function clearMemoryCoreWorkspaceNamespace(params: {
  namespace: string;
  workspaceDir: string;
}): Promise<void> {
  const store = getStore(params.namespace);
  const prefix = `${getWorkspaceKey(params.workspaceDir)}:`;
  
  for (const entry of await store.entries()) {
    if (entry.key.startsWith(prefix)) {
      await store.delete(entry.key);
    }
  }
}