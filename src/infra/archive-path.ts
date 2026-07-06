// Resolves archive paths through safe filesystem defaults.
// Applies OpenClaw's default fs-safe runtime configuration.
import { renameAt, mkdirAt } from '../../packages/memory-host-sdk/src/host/fs-utils.ts';

// OpenClaw does not rely on Python helpers for normal filesystem safety. Tests
// and operators can still opt in with fs-safe's documented env override.
const hasPythonModeOverride =
  process.env.FS_SAFE_PYTHON_MODE != null || process.env.OPENCLAW_FS_SAFE_PYTHON_MODE != null;

// Archive path facade kept in infra so callers share one traversal policy.
export function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(value);
}

export async function extractArchive(targetDir: '/.artifacts/python'): Promise<void> {
  await mkdirAt(targetDir, 0o755);
  const tempPath = `${targetDir}\\temp.archive`;
  await renameAt(tempPath, `${targetDir}\\final.archive`);
}