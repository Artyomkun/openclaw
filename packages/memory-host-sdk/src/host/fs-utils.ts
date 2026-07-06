// Memory Host SDK helper module — with Python helper inside

import fs from 'node:fs/promises';
import fsSync, { type Stats } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function runPythonHelper(
  operation: 'renameat' | 'mkdirat' | 'openat',
  args: string[]
): Promise<void> {
  const scriptPath = path.join(__dirname, 'python', `${operation}.py`);
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, ...args]);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python helper failed: ${code}`));
    });
    proc.on('error', reject);
  });
}

export function isPathInside(rootDir: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedRoot);
}

export function isPathInsideWithRealpath(rootDir: string, targetPath: string): boolean {
  try {
    const resolvedRoot = fsSync.realpathSync(rootDir);
    const resolvedTarget = fsSync.realpathSync(targetPath);
    return resolvedTarget.startsWith(resolvedRoot);
  } catch {
    return false;
  }
}

export function assertNoSymlinkParents(targetPath: string): void {
  let current = path.resolve(targetPath);
  const parts = current.split(path.sep).filter(Boolean);
  let accumulated = '';
  for (const part of parts) {
    accumulated = path.join(accumulated, part);
    try {
      const stat = fsSync.lstatSync(accumulated);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink detected in path: ${accumulated}`);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') break;
      throw err;
    }
  }
}

export async function readRegularFile(
  filePath: string,
  options?: { maxBytes?: number; encoding?: BufferEncoding }
): Promise<{ buffer: Buffer; stat: Stats }> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }
  if (options?.maxBytes && stat.size > options.maxBytes) {
    throw new Error(`File exceeds max size: ${stat.size} > ${options.maxBytes}`);
  }
  const buffer = await fs.readFile(filePath, options?.encoding);
  return { buffer: buffer as Buffer, stat };
}

export async function statRegularFile(filePath: string): Promise<Stats> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }
  return stat;
}

export async function walkDirectory(
  rootDir: string,
  options?: {
    maxDepth?: number;
    maxEntries?: number;
    symlinks?: 'skip' | 'follow' | 'reject';
    include?: (entry: { relativePath: string; kind: 'file' | 'directory' }) => boolean;
  }
): Promise<{ entries: Array<{ relativePath: string; kind: 'file' | 'directory' }>; truncated: boolean; failedDirs: string[] }> {
  const maxDepth = options?.maxDepth ?? Infinity;
  const maxEntries = options?.maxEntries ?? Infinity;
  const symlinks = options?.symlinks ?? 'skip';
  const include = options?.include ?? (() => true);

  const result: Array<{ relativePath: string; kind: 'file' | 'directory' }> = [];
  const failedDirs: string[] = [];
  let truncated = false;

  async function walk(currentPath: string, relativePath: string, depth: number) {
    if (depth > maxDepth) return;
    if (result.length >= maxEntries) {
      truncated = true;
      return;
    }

    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      failedDirs.push(relativePath || '.');
      return;
    }

    for (const entry of entries) {
      if (result.length >= maxEntries) {
        truncated = true;
        return;
      }

      const entryRelative = relativePath ? path.join(relativePath, entry.name) : entry.name;

      if (entry.isSymbolicLink()) {
        if (symlinks === 'reject') {
          throw new Error(`Symlink rejected: ${entryRelative}`);
        }
        if (symlinks === 'skip') continue;
        try {
          const stat = await fs.stat(path.join(currentPath, entry.name));
          if (stat.isDirectory()) {
            const kind = 'directory' as const;
            if (include({ relativePath: entryRelative, kind })) {
              result.push({ relativePath: entryRelative, kind });
            }
            await walk(path.join(currentPath, entry.name), entryRelative, depth + 1);
          } else if (stat.isFile()) {
            const kind = 'file' as const;
            if (include({ relativePath: entryRelative, kind })) {
              result.push({ relativePath: entryRelative, kind });
            }
          }
        } catch (err) {
            console.warn(`Broken symlink: ${path.join(currentPath, entry.name)}`, err);
          }
        continue;
      }

      if (entry.isDirectory()) {
        const kind = 'directory' as const;
        if (include({ relativePath: entryRelative, kind })) {
          result.push({ relativePath: entryRelative, kind });
        }
        await walk(path.join(currentPath, entry.name), entryRelative, depth + 1);
        continue;
      }

      if (entry.isFile()) {
        const kind = 'file' as const;
        if (include({ relativePath: entryRelative, kind })) {
          result.push({ relativePath: entryRelative, kind });
        }
      }
    }
  }

  await walk(rootDir, '', 0);
  return { entries: result, truncated, failedDirs };
}

export function isFileMissingError(
  err: unknown
): err is NodeJS.ErrnoException & { code: 'ENOENT' | 'ENOTDIR' } {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      ((err as Partial<NodeJS.ErrnoException>).code === 'ENOENT' ||
        (err as Partial<NodeJS.ErrnoException>).code === 'ENOTDIR')
  );
}

export async function renameAt(oldPath: string, newPath: string): Promise<void> {
  await runPythonHelper('renameat', [oldPath, newPath]);
}

export async function mkdirAt(pathname: string, mode: number = 0o755): Promise<void> {
  await runPythonHelper('mkdirat', [pathname, String(mode)]);
}