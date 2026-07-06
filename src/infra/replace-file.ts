// Atomic replacement and move helpers for OpenClaw install flows.
// All filesystem operations use native Node.js fs/promises.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────

export type ReplaceFileAtomicOptions = {
  filePath: string;
  content: string | Buffer;
  mode?: number;
  dirMode?: number;
  copyFallbackOnPermissionError?: boolean;
  syncTempFile?: boolean;
  syncParentDir?: boolean;
  beforeRename?: (params: { filePath: string; tempPath: string }) => Promise<void>;
  tempPrefix?: string;
};

export type ReplaceFileAtomicResult = {
  filePath: string;
};

export type ReplaceFileAtomicSyncOptions = {
  filePath: string;
  content: string | Buffer;
  mode?: number;
  dirMode?: number;
  copyFallbackOnPermissionError?: boolean;
  syncTempFile?: boolean;
  syncParentDir?: boolean;
  beforeRename?: (params: { filePath: string; tempPath: string }) => void;
  tempPrefix?: string;
};

export type MovePathWithCopyFallbackOptions = {
  from: string;
  to: string;
  sourceHardlinks?: 'allow' | 'reject';
};

// ─── Helpers ────────────────────────────────────────────────────

async function ensureDir(filePath: string, mode: number): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode });
}

function ensureDirSync(filePath: string, mode: number): void {
  const dir = path.dirname(filePath);
  fsSync.mkdirSync(dir, { recursive: true, mode });
}

async function isHardlinked(filePath: string): Promise<boolean> {
  const stat = await fs.lstat(filePath);
  return stat.isFile() && stat.nlink > 1;
}

function isHardlinkedSync(filePath: string): boolean {
  const stat = fsSync.lstatSync(filePath);
  return stat.isFile() && stat.nlink > 1;
}

// ─── Atomic file replace ───────────────────────────────────────

export async function replaceFileAtomic(
  options: ReplaceFileAtomicOptions,
): Promise<ReplaceFileAtomicResult> {
  const {
    filePath,
    content,
    mode = 0o600,
    dirMode = 0o777 & ~process.umask(),
    copyFallbackOnPermissionError = true,
    syncTempFile = true,
    syncParentDir = true,
    beforeRename,
    tempPrefix = '.fs-safe-replace',
  } = options;

  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${tempPrefix}.${process.pid}.${Date.now()}.tmp`);

  await ensureDir(filePath, dirMode);

  try {
    await fs.writeFile(tempPath, content, { mode, flag: 'wx' });
    if (syncTempFile) {
      const handle = await fs.open(tempPath, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }

    if (beforeRename) {
      await beforeRename({ filePath, tempPath });
    }

    try {
      await fs.rename(tempPath, filePath);
    } catch (err: any) {
      if (copyFallbackOnPermissionError && (err.code === 'EPERM' || err.code === 'EACCES')) {
        await fs.copyFile(tempPath, filePath);
        await fs.unlink(tempPath);
      } else {
        throw err;
      }
    }

    if (syncParentDir) {
      const parentHandle = await fs.open(dir, 'r');
      try {
        await parentHandle.sync();
      } finally {
        await parentHandle.close();
      }
    }

    return { filePath };
  } catch (err) {
    try {
      await fs.unlink(tempPath);
    } catch (cleanupError) {
      console.warn(`Failed to clean up temp file ${tempPath}:`, cleanupError);
    }
    throw err;
  }
}

// ─── Move with copy fallback ───────────────────────────────────

async function assertNoHardlinkedFiles(sourcePath: string): Promise<void> {
  const stat = await fs.lstat(sourcePath);
  if (stat.isFile() && stat.nlink > 1) {
    throw new Error(`Hardlinked source file is not allowed: ${sourcePath}`);
  }
  if (!stat.isDirectory()) {
    return;
  }

  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(sourcePath, entry.name);
    if (entry.isDirectory()) {
      await assertNoHardlinkedFiles(entryPath);
    } else if (entry.isFile() && (await isHardlinked(entryPath))) {
      throw new Error(`Hardlinked source file is not allowed: ${entryPath}`);
    }
  }
}

export async function movePathWithCopyFallback(
  options: MovePathWithCopyFallbackOptions,
): Promise<void> {
  const { from, to, sourceHardlinks = 'allow' } = options;

  if (sourceHardlinks === 'reject') {
    await assertNoHardlinkedFiles(from);
  }

  try {
    await fs.rename(from, to);
  } catch (err: any) {
    if (err.code === 'EXDEV' || err.code === 'EPERM' || err.code === 'EACCES') {
      await fs.cp(from, to, { recursive: true });
      await fs.rm(from, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

// ─── Directory atomic replace ──────────────────────────────────

export async function replaceDirectoryAtomic(
  srcDir: string,
  destDir: string,
): Promise<void> {
  try {
    await fs.access(srcDir);
  } catch {
    throw new Error(`Source directory does not exist: ${srcDir}`);
  }
  try {
    await fs.rm(destDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to remove destination directory ${destDir}:`, error);
  }
  await fs.cp(srcDir, destDir, { recursive: true });
}