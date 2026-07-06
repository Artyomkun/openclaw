/**
 * Memory Core - Session Search Visibility
 * 
 * Controls which session search results are visible to the requester.
 * LEGACY CLEANUP: Removed deprecated functions.
 * 
 * RESPONSIBILITIES:
 * - Filter session hits by visibility rules
 * - Handle agent-to-agent policies
 * - Process session artifact identity
 * - Apply session key filtering
 * 
 * ORACLE ADAPTATIONS:
 * - Works with Oracle session data
 * - Cross-agent session isolation
 * - Sandboxed session visibility
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core-host-runtime-core";
import type { MemorySearchResult } from "openclaw/plugin-sdk/memory-core-host-runtime-files";
import { resolveSessionAgentId } from "openclaw/plugin-sdk/memory-host-core";
import {
  loadCombinedSessionStoreForGateway,
  resolveTranscriptStemToSessionKeys,
} from "openclaw/plugin-sdk/session-transcript-hit";
import {
  createAgentToAgentPolicy,
  createSessionVisibilityGuard,
  resolveEffectiveSessionToolsVisibility,
} from "openclaw/plugin-sdk/session-visibility";
import { readQmdSessionArtifactIdentity } from "./qmd-session-artifacts.js";

// ========================================================================
// Utilities
// ========================================================================

/**
 * Normalizes agent ID for comparison.
 * 
 * @param value - Agent ID
 * @returns Normalized agent ID or undefined
 */
function normalizeAgentIdForCompare(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

/**
 * Checks if session key is global scope.
 * 
 * @param cfg - OpenClaw configuration
 * @param key - Session key
 * @returns True if global scope
 */
function isGlobalSessionKeyForSharedScope(cfg: OpenClawConfig, key: string): boolean {
  return cfg.session?.scope === "global" && key.trim().toLowerCase() === "global";
}

/**
 * Filters session keys by scoped agent.
 * 
 * @param params - Filter parameters
 * @param params.cfg - OpenClaw configuration
 * @param params.keys - Session keys
 * @param params.scopedAgentId - Scoped agent ID
 * @returns Filtered keys
 */
function filterSessionKeysByScopedAgent(params: {
  cfg: OpenClawConfig;
  keys: string[];
  scopedAgentId: string | undefined;
}): string[] {
  const scopedAgentId = normalizeAgentIdForCompare(params.scopedAgentId);
  if (!scopedAgentId) {
    return params.keys;
  }
  
  return params.keys.filter((key) => {
    // Global session keys are always visible
    if (isGlobalSessionKeyForSharedScope(params.cfg, key)) {
      return true;
    }
    
    const ownerAgentId = resolveSessionAgentId({
      sessionKey: key,
      config: params.cfg,
    });
    
    return normalizeAgentIdForCompare(ownerAgentId) === scopedAgentId;
  });
}

// ========================================================================
// Main Filter Function
// ========================================================================

/**
 * Filters memory search hits by session visibility.
 * 
 * @param params - Filter parameters
 * @param params.cfg - OpenClaw configuration
 * @param params.agentId - Agent ID
 * @param params.requesterSessionKey - Requester session key
 * @param params.sandboxed - Whether sandboxed
 * @param params.hits - Search results
 * @returns Filtered results
 * 
 * @example
 * ```typescript
 * const filtered = await filterMemorySearchHitsBySessionVisibility({
 *   cfg: config,
 *   requesterSessionKey: 'user:direct:123',
 *   sandboxed: false,
 *   hits: searchResults
 * });
 * ```
 */
export async function filterMemorySearchHitsBySessionVisibility(params: {
  cfg: OpenClawConfig;
  agentId?: string;
  requesterSessionKey: string | undefined;
  sandboxed: boolean;
  hits: MemorySearchResult[];
}): Promise<MemorySearchResult[]> {
  // Resolve visibility settings
  const visibility = resolveEffectiveSessionToolsVisibility({
    cfg: params.cfg,
    sandboxed: params.sandboxed,
  });
  
  // Create agent-to-agent policy
  const a2aPolicy = createAgentToAgentPolicy(params.cfg);
  
  // Resolve requester agent ID
  const requesterAgentId = params.requesterSessionKey
    ? resolveSessionAgentId({
        sessionKey: params.requesterSessionKey,
        config: params.cfg,
      })
    : undefined;
  
  const scopedAgentId = params.agentId?.trim() || requesterAgentId;
  
  // Create visibility guard
  const guard = params.requesterSessionKey
    ? await createSessionVisibilityGuard({
        action: "history",
        requesterSessionKey: params.requesterSessionKey,
        visibility,
        a2aPolicy,
      })
    : null;

  // Load session store
  const { store: combinedSessionStore } = loadCombinedSessionStoreForGateway(
    params.cfg,
    scopedAgentId ? { agentId: scopedAgentId } : {},
  );

  const next: MemorySearchResult[] = [];

  for (const hit of params.hits) {
    // Non-session hits are always visible
    if (hit.source !== "sessions") {
      next.push(hit);
      continue;
    }

    // No requester session key or guard → skip
    if (!params.requesterSessionKey || !guard) {
      continue;
    }

    // Read QMD session artifact identity
    const artifactIdentity = readQmdSessionArtifactIdentity(hit);
    
    if (artifactIdentity) {
      // Check if agent matches scope
      const normalizedScopedAgentId = normalizeAgentIdForCompare(scopedAgentId);
      const normalizedOwnerAgentId = normalizeAgentIdForCompare(artifactIdentity.agentId);
      
      if (
        normalizedScopedAgentId &&
        normalizedOwnerAgentId &&
        normalizedOwnerAgentId !== normalizedScopedAgentId
      ) {
        continue; // Different agent → skip
      }

      // Resolve session keys from stem
      const keys = filterSessionKeysByScopedAgent({
        cfg: params.cfg,
        scopedAgentId,
        keys: resolveTranscriptStemToSessionKeys({
          store: combinedSessionStore,
          stem: artifactIdentity.stem,
          allowQmdSlugFallback: artifactIdentity.archived,
        }),
      });

      if (keys.length === 0) {
        continue;
      }

      // Check visibility for each key
      const allowed = keys.some((key) => guard.check(key).allowed);
      if (!allowed) {
        continue;
      }

      next.push(hit);
      continue;
    }

    // NOTE: Legacy path removed. All session hits should have artifact identity.
    // Hits without identity are skipped.
    continue;
  }

  return next;
}