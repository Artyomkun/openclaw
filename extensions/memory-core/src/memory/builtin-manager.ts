/**
 * Memory Core - Builtin Manager
 * 
 * Простой враппер для MemoryIndexManager.
 * Только фасад, без лишней сложности.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import type {
  MemoryEmbeddingProbeResult,
  MemorySearchManager,
  MemorySearchResult,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";

// ========================================================================
// Ленивый импорт MemoryIndexManager
// ========================================================================

let MemoryIndexManager: any = null;

async function getMemoryIndexManager() {
    if (!MemoryIndexManager) {
        const module = await import("./manager.js");
        MemoryIndexManager = module.MemoryIndexManager;
    }
    return MemoryIndexManager;
}

// ========================================================================
// Builtin Manager
// ========================================================================

export class BuiltinMemoryManager implements MemorySearchManager {
    private manager: any = null;
    private agentId: string;
    private cfg: OpenClawConfig;

    constructor(cfg: OpenClawConfig, agentId: string) {
        this.cfg = cfg;
        this.agentId = agentId;
    }

    private async ensureManager() {
        if (!this.manager) {
            const Manager = await getMemoryIndexManager();
            this.manager = await Manager.get({
                cfg: this.cfg,
                agentId: this.agentId,
            });
        }
        return this.manager;
    }

    async search(query: string, opts?: any): Promise<MemorySearchResult[]> {
        const manager = await this.ensureManager();
        return manager.search(query, opts);
    }

    async readFile(params: { relPath: string; from?: number; lines?: number }) {
        const manager = await this.ensureManager();
        return manager.readFile(params);
    }

    status() {
        return {
            backend: 'builtin',
            agentId: this.agentId,
        };
    }

    async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
        const manager = await this.ensureManager();
        return manager.probeEmbeddingAvailability();
    }

    async probeVectorAvailability() {
        const manager = await this.ensureManager();
        return manager.probeVectorAvailability();
    }

    async close() {
        if (this.manager) {
        await this.manager.close();
        this.manager = null;
        }
    }
}

// ========================================================================
// Factory
// ========================================================================

export async function getBuiltinSearchManager(params: {
    cfg: OpenClawConfig;
    agentId: string;
}) {
    try {
        const manager = new BuiltinMemoryManager(params.cfg, params.agentId);
        await manager.probeEmbeddingAvailability();
        return manager;
    } catch (error) {
        console.warn('[Builtin] Failed to create manager:', error);
        return null;
    }
}

// ========================================================================
// Export
// ========================================================================

export default {
    BuiltinMemoryManager,
    getBuiltinSearchManager,
};