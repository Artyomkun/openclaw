// Private secret file helpers using native Node.js fs.

import fsSync from 'node:fs';
import path from 'node:path';
import { resolveUserPath } from '../utils.ts';

// ─── Constants ──────────────────────────────────────────────────

export const DEFAULT_SECRET_FILE_MAX_BYTES = 1024 * 1024; // 1 MiB
export const PRIVATE_SECRET_DIR_MODE = 0o700;
export const PRIVATE_SECRET_FILE_MODE = 0o600;

// ─── Types ──────────────────────────────────────────────────────

export type SecretFileReadOptions = {
  maxBytes?: number;
};

export type SecretFileReadResult =
  | {
      ok: true;
      secret: string;
      resolvedPath: string;
    }
  | {
      ok: false;
      message: string;
      resolvedPath?: string;
      error?: unknown;
    };

// ─── Secret file write ─────────────────────────────────────────

export function writeSecretFileAtomic(params: {
  rootDir: string;
  filePath: string;
  content: string | Buffer;
  dirMode?: number;
  mode?: number;
}): string {
  const { rootDir, filePath, content, dirMode = PRIVATE_SECRET_DIR_MODE, mode = PRIVATE_SECRET_FILE_MODE } = params;

  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(resolvedRoot)) {
    throw new Error(`File path escapes root: ${filePath}`);
  }

  const dir = path.dirname(resolvedPath);
  try {
    fsSync.mkdirSync(dir, { recursive: true, mode: dirMode });
  } catch (err: any) {
    throw new Error(`Failed to create secret directory: ${err.message}`);
  }

  const tempPath = `${resolvedPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fsSync.writeFileSync(tempPath, content, { mode });
    fsSync.renameSync(tempPath, resolvedPath);
    return resolvedPath;
  } catch (err: any) {
    try {
      fsSync.unlinkSync(tempPath);
      } catch (err: any) {
        try {
          fsSync.unlinkSync(tempPath);
        } catch (cleanupError) {
          console.warn(`Failed to clean up temp file ${tempPath}:`, cleanupError);
        }
        throw new Error(`Failed to write secret file: ${err.message}`);
      }
    throw new Error(`Failed to write secret file: ${err.message}`);
  }
}