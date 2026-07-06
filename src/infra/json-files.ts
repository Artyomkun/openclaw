// JSON reads and atomic writes with OpenClaw defaults.
// All filesystem operations use native Node.js fs/promises.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { replaceFileAtomic } from './replace-file.ts';

type WriteTextAtomicBeforeRename = (params: {
  filePath: string;
  tempPath: string;
}) => Promise<void>;

export type WriteTextAtomicOptions = {
  mode?: number;
  dirMode?: number;
  trailingNewline?: boolean;
  durable?: boolean;
  beforeRename?: WriteTextAtomicBeforeRename;
  tempPrefix?: string;
};

// ─── JSON read / write helpers ─────────────────────────────────

async function readJsonImpl<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

export async function readJson<T>(filePath: string): Promise<T> {
  try {
    return await readJsonImpl<T>(filePath);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error(`JSON file not found: ${filePath}`);
    }
    throw new Error(`Failed to read JSON: ${err.message}`);
  }
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return await readJsonImpl<T>(filePath);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function readJsonFileStrict<T>(filePath: string): Promise<T> {
  return readJson<T>(filePath);
}

export async function readDurableJsonFile<T>(filePath: string): Promise<T | null> {
  return readJsonIfExists<T>(filePath);
}

export async function tryReadJson<T>(filePath: string): Promise<T | null> {
  return readJsonIfExists<T>(filePath);
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  return tryReadJson<T>(filePath);
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const tempPath = `${filePath}.tmp-${process.pid}`;
  try {
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (err) {
    try {
      await fs.unlink(tempPath);
    } catch (cleanupError) {
      console.warn(`Failed to clean up temp file ${tempPath}:`, cleanupError);
    }
    throw err;
  }
}

// ─── Atomic text write ─────────────────────────────────────────

export async function writeTextAtomic(
  filePath: string,
  content: string,
  options?: WriteTextAtomicOptions,
): Promise<void> {
  const payload = options?.trailingNewline && !content.endsWith('\n') ? `${content}\n` : content;
  await replaceFileAtomic({
    filePath,
    content: payload,
    mode: options?.mode ?? 0o600,
    dirMode: options?.dirMode ?? 0o777 & ~process.umask(),
    copyFallbackOnPermissionError: true,
    syncTempFile: options?.durable !== false,
    syncParentDir: options?.durable !== false,
    ...(options?.beforeRename ? { beforeRename: options.beforeRename } : {}),
    ...(options?.tempPrefix ? { tempPrefix: options.tempPrefix } : {}),
  });
}