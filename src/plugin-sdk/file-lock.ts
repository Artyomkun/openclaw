// File lock helpers — полностью асинхронная версия

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { shouldRemoveDeadOwnerOrExpiredLock } from '../infra/stale-lock-file.ts';
import { getProcessStartTime } from '../shared/pid-alive.ts';

// ─── Types ──────────────────────────────────────────────────────

export type FileLockOptions = {
  retries: {
    retries: number;
    factor: number;
    minTimeout: number;
    maxTimeout: number;
    randomize?: boolean;
  };
  stale: number;
};

export type FileLockHandle = {
  lockPath: string;
  release: () => Promise<void>;
};

export const FILE_LOCK_TIMEOUT_ERROR_CODE = 'file_lock_timeout';
export const FILE_LOCK_STALE_ERROR_CODE = 'file_lock_stale';

export type FileLockTimeoutError = Error & {
  code: typeof FILE_LOCK_TIMEOUT_ERROR_CODE;
  lockPath: string;
};

export type FileLockStaleError = Error & {
  code: typeof FILE_LOCK_STALE_ERROR_CODE;
  lockPath: string;
};

// ─── Local state ───────────────────────────────────────────────

const MANAGER_KEY = 'openclaw.plugin-sdk.file-lock';
const activeLocks = new Map<string, { count: number; release: () => Promise<void> }>();

// ─── Helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getLockPath(filePath: string): string {
  return `${filePath}.lock`;
}

function readLockPayload(lockPath: string): Record<string, unknown> | null {
  try {
    const content = fsSync.readFileSync(lockPath, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    console.warn(`Failed to read lock payload ${lockPath}:`, err);
    return null;
  }
}

function removeLockFile(lockPath: string): void {
  try {
    fsSync.unlinkSync(lockPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn(`Failed to remove lock file ${lockPath}:`, err);
    }
  }
}

function isLockStale(lockPath: string, staleMs: number): boolean {
  const payload = readLockPayload(lockPath);
  if (!payload) {
    return true;
  }

  const now = Date.now();
  const createdAt = payload.createdAt ? new Date(payload.createdAt as string).getTime() : null;
  if (!createdAt) {
    return true;
  }

  return now - createdAt > staleMs;
}

async function tryAcquireLockAsync(
  lockPath: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const fd = await fs.open(lockPath, 'wx', 0o644);
    try {
      await fd.writeFile(JSON.stringify(payload, null, 2));
    } finally {
      await fd.close();
    }
    return true;
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      return false;
    }
    console.warn(`Failed to create lock file ${lockPath}:`, err);
    return false;
  }
}

async function acquireLockWithRetry(
  lockPath: string,
  payload: Record<string, unknown>,
  options: FileLockOptions,
): Promise<{ lockPath: string }> {
  const { retries, stale } = options;
  let attempt = 0;
  const baseTimeout = retries.minTimeout;

  while (attempt <= retries.retries) {
    if (isLockStale(lockPath, stale)) {
      removeLockFile(lockPath);
    }
    if (await tryAcquireLockAsync(lockPath, payload)) {
      return { lockPath };
    }

    attempt++;
    if (attempt > retries.retries) {
      break;
    }

    const delay = Math.min(
      baseTimeout * Math.pow(retries.factor, attempt),
      retries.maxTimeout,
    );
    const finalDelay = retries.randomize ? randomBetween(delay, delay * 2) : delay;
    await sleep(finalDelay);
  }

  const error = new Error(`Failed to acquire lock after ${retries.retries} retries`) as FileLockTimeoutError;
  error.code = FILE_LOCK_TIMEOUT_ERROR_CODE;
  error.lockPath = lockPath;
  throw error;
}

export function resetFileLockStateForTest(): void {
  for (const [lockPath] of activeLocks) {
    removeLockFile(lockPath);
  }
  activeLocks.clear();
}

export async function drainFileLockStateForTest(): Promise<void> {
  resetFileLockStateForTest();
}

export async function acquireFileLock(
  filePath: string,
  options: FileLockOptions,
): Promise<FileLockHandle> {
  const lockPath = getLockPath(filePath);
  const existing = activeLocks.get(lockPath);
  if (existing) {
    existing.count++;
    return {
      lockPath,
      release: async () => {
        const entry = activeLocks.get(lockPath);
        if (!entry) return;
        entry.count--;
        if (entry.count === 0) {
          activeLocks.delete(lockPath);
          removeLockFile(lockPath);
        }
      },
    };
  }

  const payload: Record<string, unknown> = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };
  const starttime = getProcessStartTime(process.pid);
  if (starttime !== null) {
    payload.starttime = starttime;
  }

  try {
    const result = await acquireLockWithRetry(lockPath, payload, options);
    activeLocks.set(lockPath, { count: 1, release: async () => {
      const entry = activeLocks.get(lockPath);
      if (!entry) return;
      entry.count--;
      if (entry.count === 0) {
        activeLocks.delete(lockPath);
        removeLockFile(lockPath);
      }
    } });
    return {
      lockPath: result.lockPath,
      release: async () => {
        const entry = activeLocks.get(lockPath);
        if (!entry) return;
        entry.count--;
        if (entry.count === 0) {
          activeLocks.delete(lockPath);
          removeLockFile(lockPath);
        }
      },
    };
  } catch (err) {
    if ((err as { code?: unknown }).code === FILE_LOCK_TIMEOUT_ERROR_CODE) {
      throw err;
    }
    throw Object.assign(new Error((err as Error).message), {
      code: FILE_LOCK_STALE_ERROR_CODE,
      lockPath,
    }) as FileLockStaleError;
  }
}

export async function withFileLock<T>(
  filePath: string,
  options: FileLockOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const lock = await acquireFileLock(filePath, options);
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}