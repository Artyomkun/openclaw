// Creates private file stores using native Node.js fs.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export type PrivateFileStore = {
  rootDir: string;
  path(relativePath: string): string;
  write(relativePath: string, data: string | Uint8Array): Promise<void>;
  read(relativePath: string): Promise<Buffer>;
  readText(relativePath: string): Promise<string>;
  readJson<T = unknown>(relativePath: string): Promise<T>;
  readJsonIfExists<T = unknown>(relativePath: string): Promise<T | null>;
  remove(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  list(relativePath?: string): Promise<string[]>;
};

export type PrivateFileStoreSync = {
  rootDir: string;
  path(relativePath: string): string;
  write(relativePath: string, data: string | Uint8Array): void;
  read(relativePath: string): Buffer;
  readText(relativePath: string): string;
  readJson<T = unknown>(relativePath: string): T;
  readJsonIfExists<T = unknown>(relativePath: string): T | null;
  remove(relativePath: string): void;
  exists(relativePath: string): boolean;
  list(relativePath?: string): string[];
};

function assertPathInside(rootDir: string, relativePath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(rootDir, relativePath);
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error(`Path escapes root: ${relativePath}`);
  }
  return resolvedTarget;
}

/** Create an async private file store rooted at `rootDir`. */
export function privateFileStore(rootDir: string): PrivateFileStore {
  const resolvedRoot = path.resolve(rootDir);

  async function ensureDir(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  return {
    rootDir: resolvedRoot,
    path: (relativePath: string) => assertPathInside(resolvedRoot, relativePath),
    write: async (relativePath: string, data: string | Uint8Array) => {
      const fullPath = assertPathInside(resolvedRoot, relativePath);
      await ensureDir(fullPath);
      await fs.writeFile(fullPath, data, { mode: 0o600 });
    },
    read: async (relativePath: string) => {
      const fullPath = assertPathInside(resolvedRoot, relativePath);
      return fs.readFile(fullPath);
    },
    readText: async (relativePath: string) => {
      const fullPath = assertPathInside(resolvedRoot, relativePath);
      return fs.readFile(fullPath, 'utf8');
    },
    readJson: async <T = unknown>(relativePath: string) => {
      const fullPath = assertPathInside(resolvedRoot, relativePath);
      const content = await fs.readFile(fullPath, 'utf8');
      return JSON.parse(content) as T;
    },
    readJsonIfExists: async <T = unknown>(relativePath: string): Promise<T | null> => {
      const fullPath = assertPathInside(resolvedRoot, relativePath);
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        return JSON.parse(content) as T;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return null;
        }
        console.error(`Failed to read JSON ${fullPath}:`, err);
        throw err;
      }
    },
    remove: async (relativePath: string) => {
      const fullPath = assertPathInside(resolvedRoot, relativePath);
      try {
        await fs.unlink(fullPath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error(`Failed to remove ${fullPath}:`, err);
          throw err;
        }
      }
    },
    exists: async (relativePath: string) => {
      const fullPath = assertPathInside(resolvedRoot, relativePath);
      try {
        await fs.access(fullPath);
        return true;
      } catch {
        return false;
      }
    },
    list: async (relativePath: string = '') => {
      const fullPath = assertPathInside(resolvedRoot, relativePath);
      try {
        const entries = await fs.readdir(fullPath);
        return entries;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return [];
        }
        console.error(`Failed to list ${fullPath}:`, err);
        throw err;
      }
    },
  };
}

/** Create a sync private file store rooted at `rootDir`. */
export function privateFileStoreSync(rootDir: string): PrivateFileStoreSync {
  const resolvedRoot = path.resolve(rootDir);

  function ensureDir(filePath: string): void {
    const dir = path.dirname(filePath);
    fsSync.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  function assertPath(relativePath: string): string {
    const fullPath = path.resolve(resolvedRoot, relativePath);
    if (!fullPath.startsWith(resolvedRoot)) {
      throw new Error(`Path escapes root: ${relativePath}`);
    }
    return fullPath;
  }

  return {
    rootDir: resolvedRoot,
    path: (relativePath: string) => assertPath(relativePath),
    write: (relativePath: string, data: string | Uint8Array) => {
      const fullPath = assertPath(relativePath);
      ensureDir(fullPath);
      fsSync.writeFileSync(fullPath, data, { mode: 0o600 });
    },
    read: (relativePath: string) => {
      const fullPath = assertPath(relativePath);
      return fsSync.readFileSync(fullPath);
    },
    readText: (relativePath: string) => {
      const fullPath = assertPath(relativePath);
      return fsSync.readFileSync(fullPath, 'utf8');
    },
    readJson: <T = unknown>(relativePath: string): T => {
      const fullPath = assertPath(relativePath);
      const content = fsSync.readFileSync(fullPath, 'utf8');
      return JSON.parse(content) as T;
    },
    readJsonIfExists: <T = unknown>(relativePath: string): T | null => {
      const fullPath = assertPath(relativePath);
      try {
        const content = fsSync.readFileSync(fullPath, 'utf8');
        return JSON.parse(content) as T;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return null;
        }
        console.error(`Failed to read JSON ${fullPath}:`, err);
        throw err;
      }
    },
    remove: (relativePath: string) => {
      const fullPath = assertPath(relativePath);
      try {
        fsSync.unlinkSync(fullPath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error(`Failed to remove ${fullPath}:`, err);
          throw err;
        }
      }
    },
    exists: (relativePath: string) => {
      const fullPath = assertPath(relativePath);
      try {
        fsSync.accessSync(fullPath);
        return true;
      } catch {
        return false;
      }
    },
    list: (relativePath: string = '') => {
      const fullPath = assertPath(relativePath);
      try {
        return fsSync.readdirSync(fullPath);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return [];
        }
        console.error(`Failed to list ${fullPath}:`, err);
        throw err;
      }
    },
  };
}