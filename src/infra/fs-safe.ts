// Re-exports fs-safe helpers with OpenClaw defaults and wrappers.
// All filesystem operations use native Node.js fs/promises.

import fs from 'node:fs/promises';
import fsSync, { type Stats } from 'node:fs';
import path from 'node:path';

export type ExternalFileWriteOptions = {
  rootDir: string;
  path: string;
  write: (tempPath: string) => Promise<void>;
  fallbackFileName?: string;
  tempPrefix?: string;
};

export type ExternalFileWriteResult = {
  path: string;
};

export async function ensureAbsoluteDirectory(
  dirPath: string,
  options?: { scopeLabel?: string; mode?: number },
): Promise<{ ok: true; path: string } | { ok: false; error: Error }> {
  const absolutePath = path.resolve(dirPath);
  try {
    await fs.mkdir(absolutePath, { recursive: true, mode: options?.mode ?? 0o755 });
    const stat = await fs.lstat(absolutePath);
    if (!stat.isDirectory()) {
      console.error(`ensureAbsoluteDirectory: path is not a directory: ${absolutePath}`);
      return { ok: false, error: new Error(`Path is not a directory: ${absolutePath}`) };
    }
    return { ok: true, path: absolutePath };
  } catch (err: any) {
    console.error(`ensureAbsoluteDirectory: failed to create directory ${absolutePath}:`, err);
    return { ok: false, error: new Error(`Failed to create directory: ${err.message}`) };
  }
}

export async function writeExternalFileWithinRoot(
  options: ExternalFileWriteOptions,
): Promise<ExternalFileWriteResult> {
  const targetPath = path.resolve(options.rootDir, options.path);
  const tempPath = path.join(
    options.rootDir,
    `.temp-${options.tempPrefix ?? 'write'}-${Date.now()}.tmp`,
  );
  try {
    await options.write(tempPath);
    await fs.rename(tempPath, targetPath);
    return { path: targetPath };
  } catch (err) {
    console.error(`writeExternalFileWithinRoot: failed to write ${targetPath}:`, err);
    try {
      await fs.unlink(tempPath);
    } catch (unlinkErr) {
      console.warn(`writeExternalFileWithinRoot: failed to clean up temp file ${tempPath}:`, unlinkErr);
    }
    throw err;
  }
}

export async function readFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  maxBytes?: number;
}): Promise<{ buffer: Buffer; stat: Stats }> {
  const fullPath = path.resolve(params.rootDir, params.relativePath);
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      console.error(`readFileWithinRoot: not a regular file: ${fullPath}`);
      throw new Error(`Not a regular file: ${fullPath}`);
    }
    if (params.maxBytes && stat.size > params.maxBytes) {
      console.error(`readFileWithinRoot: file exceeds max size: ${stat.size} > ${params.maxBytes}`);
      throw new Error(`File exceeds max size: ${stat.size} > ${params.maxBytes}`);
    }
    const buffer = await fs.readFile(fullPath);
    return { buffer, stat };
  } catch (err: any) {
    console.error(`readFileWithinRoot: failed to read ${fullPath}:`, err);
    throw err;
  }
}

export async function writeFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  data: string | Buffer;
  encoding?: BufferEncoding;
  mkdir?: boolean;
}): Promise<void> {
  const fullPath = path.resolve(params.rootDir, params.relativePath);
  const dir = path.dirname(fullPath);
  try {
    if (params.mkdir) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(fullPath, params.data, { encoding: params.encoding ?? 'utf8' });
  } catch (err: any) {
    console.error(`writeFileWithinRoot: failed to write ${fullPath}:`, err);
    throw err;
  }
}

export function isPathInside(rootDir: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedRoot);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function pathExistsSync(filePath: string): boolean {
  try {
    fsSync.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}