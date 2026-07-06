/**
 * Memory Core - Search Manager
 * 
 * Просто получаем менеджер поиска.
 * С graceful shutdown.
 * БЕЗ ПРОГЛАТЫВАНИЯ ОШИБОК!
 */

import { resolveMemoryBackendConfig } from "openclaw/plugin-sdk/memory-core-host-engine-storage";
import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core-host-engine-foundation";

const cache = new Map();
let isShuttingDown = false;
const log = console;

// ========================================================================
// ОШИБКИ
// ========================================================================

export class MemoryManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryManagerError';
  }
}

// ========================================================================
// MAIN
// ========================================================================

export async function getMemorySearchManager(params: {
  cfg: OpenClawConfig;
  agentId: string;
}) {
  if (isShuttingDown) {
    throw new MemoryManagerError('System is shutting down');
  }

  const key = params.agentId;
  
  if (cache.has(key)) {
    return cache.get(key);
  }

  const config = resolveMemoryBackendConfig(params);
  let manager = null;
  const errors: Error[] = [];

  // QMD
  if (config.backend === "qmd") {
    try {
      const { QmdMemoryManager } = await import("./qmd-manager.js");
      manager = await QmdMemoryManager.create(params);
      if (manager) {
        log.info(`[Memory] QMD manager created for ${params.agentId}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      log.warn(`[Memory] QMD unavailable for ${params.agentId}:`, err.message);
    }
  }
  if (!manager) {
    try {
      const { MemoryIndexManager } = await import("./builtin-manager.js");
      manager = await MemoryIndexManager.get(params);
      if (manager) {
        log.info(`[Memory] Builtin manager created for ${params.agentId}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      log.error(`[Memory] Builtin unavailable for ${params.agentId}:`, err.message);
    }
  }
  if (!manager) {
    const details = errors.map(e => e.message).join('; ');
    throw new MemoryManagerError(
      `No memory manager available for ${params.agentId}: ${details}`,
      errors
    );
  }

  cache.set(key, manager);
  if (!globalThis.__memorySearchCleanup) {
    globalThis.__memorySearchCleanup = true;
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('exit', () => gracefulShutdown('exit'));
  }

  return manager;
}

// ========================================================================
// GRACEFUL SHUTDOWN
// ========================================================================

export async function gracefulShutdown(signal?: string) {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  log.info(`[Memory] Graceful shutdown started${signal ? ` (${signal})` : ''}`);

  const timeout = setTimeout(() => {
    log.error('[Memory] Shutdown timeout (30s), forcing exit');
    process.exit(1);
  }, 30000);

  try {
    const managers = Array.from(cache.values());
    
    if (managers.length === 0) {
      log.info('[Memory] No managers to close');
    } else {
      log.info(`[Memory] Closing ${managers.length} managers...`);
      
      const results = await Promise.allSettled(
        managers.map(async (manager, index) => {
          try {
            await manager?.close?.();
            return { index, status: 'ok' };
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            return { index, status: 'error', error: err };
          }
        })
      );
      const errors = results.filter(r => r.status === 'rejected' || (r.value?.status === 'error'));
      if (errors.length > 0) {
        log.warn(`[Memory] ${errors.length} managers failed to close`);
        for (const err of errors) {
          const error = err.status === 'rejected' ? err.reason : err.value?.error;
          log.warn(`[Memory] Close error:`, error?.message || 'unknown');
        }
      } else {
        log.info('[Memory] All managers closed successfully');
      }
    }

    cache.clear();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error('[Memory] Error during shutdown:', err.message);
  } finally {
    clearTimeout(timeout);
    log.info('[Memory] Shutdown complete');
    
    if (signal) {
      process.exit(0);
    }
  }
}

// ========================================================================
// CLEANUP
// ========================================================================

export async function closeAll() {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  log.info('[Memory] Closing all managers...');

  const managers = Array.from(cache.entries());
  const errors: Error[] = [];

  for (const [key, manager] of managers) {
    try {
      await manager?.close?.();
      log.debug(`[Memory] Closed manager for ${key}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      log.error(`[Memory] Error closing manager for ${key}:`, err.message);
    }
  }

  cache.clear();
  isShuttingDown = false;

  if (errors.length > 0) {
    throw new MemoryManagerError(
      `Failed to close ${errors.length} managers`,
      errors
    );
  }

  log.info(`[Memory] All ${managers.length} managers closed`);
}

// ========================================================================
// HEALTH CHECK
// ========================================================================

export function getStatus() {
  return {
    active: !isShuttingDown,
    managers: cache.size,
    keys: Array.from(cache.keys()),
    timestamp: new Date().toISOString(),
  };
}

// ========================================================================
// EXPORTS
// ========================================================================

export default {
  getMemorySearchManager,
  gracefulShutdown,
  closeAll,
  getStatus,
  MemoryManagerError,
};