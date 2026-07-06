// Loads and saves JSON files with symlink backup handling.

import fs from 'node:fs';
import path from 'node:path';

function resolveJsonSymlinkTarget(pathname: string): string | undefined {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(pathname);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    console.error(`resolveJsonSymlinkTarget: failed to lstat ${pathname}:`, error);
    throw error;
  }
  if (!stat.isSymbolicLink()) {
    return undefined;
  }

  try {
    const linkTarget = fs.readlinkSync(pathname);
    return path.resolve(path.dirname(pathname), linkTarget);
  } catch (error) {
    console.error(`resolveJsonSymlinkTarget: failed to readlink ${pathname}:`, error);
    throw error;
  }
}

function resolveJsonSaveTarget(pathname: string): string {
  const target = resolveJsonSymlinkTarget(pathname);
  if (!target) {
    return pathname;
  }
  try {
    fs.statSync(path.dirname(target));
  } catch (error) {
    console.error(`resolveJsonSaveTarget: parent directory does not exist for ${target}:`, error);
    throw error;
  }
  return target;
}

function tryReadJsonSync<T = unknown>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
      console.warn(`tryReadJsonSync: path is a directory, not a file: ${filePath}`);
      return null;
    }
    console.error(`tryReadJsonSync: failed to read or parse ${filePath}:`, error);
    throw error;
  }
}

function writeJsonSync(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`writeJsonSync: failed to create directory ${dir}:`, error);
    throw error;
  }

  const tempPath = `${filePath}.tmp-${process.pid}`;
  try {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    console.error(`writeJsonSync: failed to write ${filePath}:`, error);
    try {
      fs.unlinkSync(tempPath);
    } catch (cleanupError) {
      console.warn(`writeJsonSync: failed to clean up temp file ${tempPath}:`, cleanupError);
    }
    throw error;
  }
}

export function saveJsonFile(pathname: string, data: unknown): void {
  const target = resolveJsonSaveTarget(pathname);
  writeJsonSync(target, data);
}

export function loadJsonFile(pathname: string): Record<string, unknown> | undefined {
  const direct = tryReadJsonSync<Record<string, unknown>>(pathname);
  if (direct !== null) {
    return direct;
  }
  const target = resolveJsonSymlinkTarget(pathname);
  if (!target) {
    return undefined;
  }
  return tryReadJsonSync<Record<string, unknown>>(target) ?? undefined;
}