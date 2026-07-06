// Inspects installed package metadata for update/install verification.

import fsSync from 'node:fs';
import path from 'node:path';
import { isRecord } from '@openclaw/normalization-core/record-coerce';

// Package update utilities inspect installed package metadata without trusting
// paths outside the provided package root.

/** Return expected integrity only for concrete semver package specs. */
export function expectedIntegrityForUpdate(
  spec: string | undefined,
  integrity: string | undefined,
): string | undefined {
  if (!integrity || !spec) {
    return undefined;
  }
  const value = spec.trim();
  if (!value) {
    return undefined;
  }
  const at = value.lastIndexOf('@');
  if (at <= 0 || at >= value.length - 1) {
    return undefined;
  }
  const version = value.slice(at + 1).trim();
  if (!/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    return undefined;
  }
  return integrity;
}

function readInstalledPackageManifest(dir: string): Record<string, unknown> | undefined {
  const manifestPath = path.join(dir, 'package.json');
  try {
    const content = fsSync.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return undefined;
    }
    console.error(`readInstalledPackageManifest: failed to read ${manifestPath}:`, error);
    throw error;
  }
}

/** Read the installed package version from a package root. */
export function readInstalledPackageVersion(dir: string): string | undefined {
  const manifest = readInstalledPackageManifest(dir);
  return typeof manifest?.version === 'string' ? manifest.version : undefined;
}

/** Read string-valued peer dependencies from an installed package. */
export function readInstalledPackagePeerDependencies(dir: string): Record<string, string> {
  const manifest = readInstalledPackageManifest(dir);
  const peerDependencies = isRecord(manifest?.peerDependencies) ? manifest.peerDependencies : {};
  return Object.fromEntries(
    Object.entries(peerDependencies).filter((entry): entry is [string, string] => {
      const [, value] = entry;
      return typeof value === 'string';
    }),
  );
}

/** Return true when an installed package needs an openclaw peer link repair. */
export function installedPackageNeedsOpenClawPeerLinkRepair(dir: string): boolean {
  const peerDependencies = readInstalledPackagePeerDependencies(dir);
  if (!Object.hasOwn(peerDependencies, 'openclaw')) {
    return false;
  }

  try {
    fsSync.statSync(path.join(dir, 'node_modules', 'openclaw'));
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' || code === 'ENOTDIR';
  }
}