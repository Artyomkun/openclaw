// Provides safe path helpers for plugin installation targets.
// All filesystem operations use native Node.js fs/promises.

import path from 'node:path';
import { createHash } from 'node:crypto';

export function assertCanonicalPathWithinBase(
  baseDir: string,
  targetPath: string,
): void {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    throw new Error(`Path escapes base directory: ${targetPath}`);
  }
}

export function resolveSafeInstallDir(
  baseDir: string,
  pluginId: string,
): string {
  const safeId = safePathSegmentHashed(pluginId);
  return path.resolve(baseDir, safeId);
}

export function safeDirName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 255) || 'unnamed';
}

export function safePathSegmentHashed(segment: string): string {
  const safe = safeDirName(segment);
  const hash = createHash('sha256')
    .update(segment)
    .digest('hex')
    .slice(0, 8);
  return `${safe}-${hash}`;
}

/** Returns the package basename for scoped npm names while preserving plain ids. */
export function unscopedPackageName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.includes('/') ? (trimmed.split('/').pop() ?? trimmed) : trimmed;
}

/** Matches a requested install id against either the full package name or unscoped basename. */
export function packageNameMatchesId(packageName: string, id: string): boolean {
  const trimmedId = id.trim();
  if (!trimmedId) {
    return false;
  }

  const trimmedPackageName = packageName.trim();
  if (!trimmedPackageName) {
    return false;
  }

  return trimmedId === trimmedPackageName || trimmedId === unscopedPackageName(trimmedPackageName);
}