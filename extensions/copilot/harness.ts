// Copilot plugin module implements harness behavior.
import type { CopilotClient } from "@github/copilot-sdk";
import {
  buildAgentHookContextChannelFields,
  compactWithSafetyTimeout,
  getModelProviderRequestTransport,
  resolveCompactionTimeoutMs,
  runAgentHarnessAfterCompactionHook,
  runAgentHarnessBeforeCompactionHook,
  type AgentHarness,
  type AgentHarnessAttemptParams,
  type AgentHarnessAttemptResult,
  type AgentHarnessCompactParams,
  type AgentHarnessCompactResult,
  type AgentHarnessResetParams,
} from "openclaw/plugin-sdk/agent-harness-runtime";
import type { PluginStateSyncKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import type { CopilotSessionConfig } from "./src/attempt.js";
import { createCopilotByokAuth, resolveCopilotAuth, tokenFingerprint } from "./src/auth-bridge.js";
import { createCopilotByokProxy } from "./src/byok-proxy.js";
import {
  isCopilotByokUnsupportedProviderError,
  resolveCopilotProvider,
  supportsCopilotByokProviderShape,
} from "./src/provider-bridge.js";
import type {
  ClientCreateOptions,
  CopilotClientPool,
  CopilotClientPoolOptions,
  PooledClient,
  PoolKey,
} from "./src/runtime.js";

export type { CopilotClientPool, CopilotClientPoolOptions };

const COPILOT_PROVIDER_IDS: ReadonlySet<string> = new Set(["github-copilot"]);

export interface CreateCopilotAgentHarnessOptions {
  id: string;
  label: string;
  pluginConfig: string;
  pool: CopilotClientPool;
  poolOptions: CopilotClientPoolOptions;
  sessionStore: CopilotSessionBindingStore;
}

interface TrackedSession {
  sdkSessionId: string;
  client: CopilotClient;
  clientOptions: ClientCreateOptions;
  poolKey: PoolKey;
  sessionConfig: CopilotSessionConfig;
  compatKey: string;
  compactKey: string;
  authMode: "gitHubToken" | "useLoggedInUser" | "byok";
  authProfileId?: string;
  authProfileVersion?: string;
}

interface CopilotHistoryCompactResult {
  success: boolean;
  tokensRemoved: number;
  messagesRemoved: number;
  summaryContent?: string;
  contextWindow?: {
    tokenLimit: number;
    currentTokens: number;
    messagesLength: number;
    systemTokens?: number;
    conversationTokens?: number;
    toolDefinitionsTokens?: number;
  };
}

interface CopilotHistoryCompactSession {
  abort(): Promise<void>;
  disconnect(): Promise<void>;
  rpc: {
    history: {
      abortManualCompaction(): Promise<{ aborted: boolean }>;
      compact(params?: { customInstructions?: string }): Promise<CopilotHistoryCompactResult>;
    };
  };
}

export type CopilotSessionBinding = {
  schemaVersion: 2;
  sdkSessionId: string;
  compatKey: string;
  compactKey: string;
  authMode: "gitHubToken" | "useLoggedInUser" | "byok";
  authProfileId?: string;
  authProfileVersion?: string;
  updatedAt: number;
};

type CopilotAttemptSessionBinding = Pick<CopilotSessionBinding, "compatKey" | "sdkSessionId">;
type DeferredCompactionCleanupOutcome = "aborted" | "completed" | "deadline";
type DeferredCompactionCleanup = {
  abort: () => void;
  sdkSessionId: string;
};

type CopilotSessionBindingStore = Pick<
  PluginStateSyncKeyedStore<CopilotSessionBinding>,
  "delete" | "lookup" | "register"
>;

type CopilotSessionAuth = Pick<
  CopilotSessionBinding,
  "authMode" | "authProfileId" | "authProfileVersion"
>;

type CopilotSessionCompatParams = AgentHarnessAttemptParams | AgentHarnessCompactParams & {
  model: ModelConfig | string;
  runtimeModel: ModelConfig;
  profileVersion: string;
  resolvedApiKey: string;
  sessionKey: string;
  workspaceDir: string;
};

type ModelConfig = {
  api: string;
  id: string;
  provider: string;
  baseUrl: string;
  azureApiVersion: string;
  headers: string;
  authHeader: boolean;
  params: string;
  request: {
    auth: { mode: "openai" | "azure" | "anthropic" | "custom" };
    proxy: string;
    tls: boolean;
    allowPrivateNetwork: boolean;
  };
  contextTokens: number;
  contextWindow: number;
  maxTokens: number;
};

function sessionAuthFields(auth: CopilotSessionAuth): CopilotSessionAuth {
  return auth.authMode === "gitHubToken" || auth.authMode === "byok"
    ? {
        authMode: auth.authMode,
        authProfileId: auth.authProfileId,
        authProfileVersion: auth.authProfileVersion,
      }
    : { authMode: "useLoggedInUser" };
}

function sessionAuthMatches(stored: CopilotSessionAuth, current: CopilotSessionAuth): boolean {
  if (stored.authMode !== current.authMode) {
    return false;
  }
  if (stored.authMode === "useLoggedInUser") {
    return true;
  }
  return (
    current.authMode === stored.authMode &&
    stored.authProfileId === current.authProfileId &&
    stored.authProfileVersion === current.authProfileVersion
  );
}

function normalizeBinding(
  value: CopilotSessionBinding | undefined,
): CopilotSessionBinding | undefined {
  if (
    !value ||
    value.schemaVersion !== 2 ||
    typeof value.sdkSessionId !== "string" ||
    value.sdkSessionId.trim() === "" ||
    typeof value.compatKey !== "string" ||
    value.compatKey.trim() === "" ||
    typeof value.compactKey !== "string" ||
    value.compactKey.trim() === "" ||
    (value.authMode !== "gitHubToken" &&
      value.authMode !== "byok" &&
      value.authMode !== "useLoggedInUser") ||
    ((value.authMode === "gitHubToken" || value.authMode === "byok") &&
      (typeof value.authProfileId !== "string" ||
        value.authProfileId.trim() === "" ||
        typeof value.authProfileVersion !== "string" ||
        value.authProfileVersion.trim() === "")) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  ) {
    return undefined;
  }
  return {
    schemaVersion: 2,
    sdkSessionId: value.sdkSessionId.trim(),
    compatKey: value.compatKey,
    compactKey: value.compactKey,
    authMode: value.authMode,
    ...(value.authMode === "gitHubToken" || value.authMode === "byok"
      ? {
          authProfileId: value.authProfileId,
          authProfileVersion: value.authProfileVersion,
        }
      : {}),
    updatedAt: value.updatedAt,
  };
}

function normalizeAttemptBinding(value: CopilotSessionBinding): CopilotAttemptSessionBinding | undefined {
  const current = normalizeBinding(value as CopilotSessionBinding);
  if (current) {
    return current;
  }
  return undefined;
}

function lookupStoredBinding(
  store: CopilotSessionBindingStore,
  key: string,
): CopilotAttemptSessionBinding | undefined {
  try {
    return normalizeAttemptBinding(store?.lookup(key));
  } catch (err) {
    console.warn(`[copilot] Failed to lookup stored binding for ${key}:`, err);
    try {
      store?.delete(key);
    } catch (deleteErr) {
      console.warn(`[copilot] Failed to delete invalid binding for ${key}:`, deleteErr);
    }
    return undefined;
  }
}

function registerStoredBinding(
  store: CopilotSessionBindingStore,
  key: string,
  binding: CopilotSessionBinding,
): boolean {
  try {
    store?.register(key, binding);
    return true;
  } catch (err) {
    console.warn(`[copilot] Failed to register stored binding for ${key}:`, err);
    try {
      store?.delete(key);
    } catch (deleteErr) {
      console.warn(`[copilot] Failed to delete failed binding for ${key}:`, deleteErr);
    }
    return false;
  }
}

function deleteStoredBinding(store: CopilotSessionBindingStore, key: string): boolean {
  try {
    store?.delete(key);
    return true;
  } catch (err) {
    console.warn(`[copilot] Failed to delete binding for ${key}:`, err);
    return false;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  const reason = "reason" in signal ? signal.reason : undefined;
  if (reason instanceof Error) {
    throw reason;
  }
  const error = reason ? new Error("aborted", { cause: reason }) : new Error("aborted");
  error.name = "AbortError";
  throw error;
}

function isStaleSdkSessionError(error: Error): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(404|not found|no such session|unknown session|stale|deleted|does not exist)\b/i.test(
    message,
  );
}

async function compactTrackedSdkSession(params: {
  abortSignal?: AbortSignal;
  client: CopilotClient;
  customInstructions?: string;
  gitHubToken?: string;
  onSession?: (session: CopilotHistoryCompactSession) => void;
  sessionConfig: CopilotSessionConfig;
  sdkSessionId: string;
}): Promise<CopilotHistoryCompactResult> {
  throwIfAborted(params.abortSignal);
  const session = (await params.client.resumeSession(params.sdkSessionId, {
    ...params.sessionConfig,
    continuePendingWork: false,
    ...(params.gitHubToken ? { gitHubToken: params.gitHubToken } : {}),
    suppressResumeEvent: true,
  })) as CopilotHistoryCompactSession;
  params.onSession?.(session);
  const request = params.customInstructions?.trim()
    ? { customInstructions: params.customInstructions }
    : undefined;
  try {
    throwIfAborted(params.abortSignal);
    return await session.rpc.history.compact(request);
  } finally {
    try {
      await session.disconnect();
    } catch (err) {
      console.warn('[copilot] Failed to disconnect session:', err);
    }
  }
}

function readAgentIdFromSessionKey(sessionKey: string): { ok: true; agentId: string } | { ok: false; error: string } {
  if (sessionKey.trim() === "") {
    return { ok: false, error: "Invalid sessionKey: must be a non-empty string" };
  }
  const parts = sessionKey.trim().split(":");
  if (parts[0] !== "agent" || !parts[1]?.trim()) {
    return { ok: false, error: "Invalid sessionKey format: expected 'agent:<agentId>:...'" };
  }
  return { ok: true, agentId: parts[1].trim() };
}

function computeSessionKey(
  params: CopilotSessionCompatParams,
  options: { includeApi: boolean; includeAuth: boolean },
): string {
  const p = params;
  const modelObj: ModelConfig = p.runtimeModel;
  const provider = p.provider;
  const modelId = p.modelId;
  const requestTransport = getModelProviderRequestTransport(p.model);

  const requestAuthMode = readSessionString(
    requestTransport?.auth?.mode ?? modelObj.request?.auth?.mode,
  );

  const azureApiVersion = readSessionString(
    modelObj.azureApiVersion ?? modelObj.params?.azureApiVersion,
  );

  let authParts: string[] = [];
  let resolvedAgentId = "";
  let resolvedCopilotHome = "";

  try {
    const resolved = !options.includeAuth
      ? resolveCopilotAuth({
          agentId: p.agentId,
          agentDir: p.agentDir,
          workspaceDir: p.workspaceDir,
          copilotHome: p.copilotHome,
          auth: { useLoggedInUser: true },
        })
      : resolveCopilotAuthWithProvider(p, modelObj, modelId, provider, requestTransport, azureApiVersion);

    resolvedAgentId = resolved.agentId;
    resolvedCopilotHome = resolved.copilotHome;
    authParts = [
      `auth.mode=${resolved.authMode}`,
      `auth.profileId=${resolved.authProfileId ?? ""}`,
      `auth.profileVersion=${resolved.authProfileVersion ?? ""}`,
    ];
    if (!options.includeAuth) {
      authParts = [];
    }
  } catch (err) {
    console.warn('[copilot] Failed to resolve auth:', err);
    authParts = ["auth=unresolvable"];
  }

  const parts = [
    `provider=${provider}`,
    `model=${modelId}`,
    ...(options.includeApi ? [`api=${modelObj.api ?? ""}`] : []),
    ...(options.includeApi ? [`baseUrlFingerprint=${fingerprintSessionValue(modelObj.baseUrl)}`] : []),
    `cwd=${p.cwd ?? p.workspaceDir ?? ""}`,
    `agentId=${resolvedAgentId}`,
    `agentDir=${p.agentDir ?? ""}`,
    `copilotHome=${p.copilotHome ?? ""}`,
    `resolvedCopilotHome=${resolvedCopilotHome}`,
    ...authParts,
  ];

  return parts.join("|");
}

function resolveCopilotAuthWithProvider(
  p: CopilotSessionCompatParams,
  modelObj: ModelConfig,
  modelId: string,
  provider: string,
  requestTransport: unknown,
  azureApiVersion: string | undefined,
) {
  const modelProvider = resolveCopilotProvider({
    model: {
      api: modelObj.api,
      id: modelId,
      provider,
      baseUrl: modelObj.baseUrl,
      azureApiVersion,
      headers: modelObj.headers,
      authHeader: modelObj.authHeader,
      requestAuthMode: readSessionString(modelObj.request?.auth?.mode),
      requestProxy: modelObj.request?.proxy,
      requestTls: modelObj.request?.tls,
      requestAllowPrivateNetwork: modelObj.request?.allowPrivateNetwork,
      contextTokens: modelObj.contextTokens,
      contextWindow: modelObj.contextWindow,
      maxTokens: modelObj.maxTokens,
    },
    resolvedApiKey: p.resolvedApiKey,
    authProfileId: p.authProfileId,
  });

  return modelProvider.mode === "byok"
    ? createCopilotByokAuth({
        agentId: p.agentId ?? "",
        agentDir: p.agentDir ?? "",
        workspaceDir: p.workspaceDir ?? "",
        copilotHome: p.copilotHome ?? "",
        authProfileId: modelProvider.authProfileId,
        authProfileVersion: modelProvider.authProfileVersion,
      })
    : resolveCopilotAuth({
        agentId: p.agentId ?? "",
        agentDir: p.agentDir ?? "",
        workspaceDir: p.workspaceDir ?? "",
        copilotHome: p.copilotHome ?? "",
        auth: p.auth,
        resolvedApiKey: p.resolvedApiKey,
        authProfileId: p.authProfileId,
        profileVersion: p.profileVersion,
      });
}

function readSessionString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function fingerprintSessionValue(value: unknown): string {
  return typeof value === "string" && value ? tokenFingerprint(value) : "";
}

function computeSessionCompatKey(params: CopilotSessionCompatParams): string {
  return computeSessionKey(params, { includeApi: true, includeAuth: true });
}

function computeSessionCompactKey(params: CopilotSessionCompatParams): string {
  return computeSessionKey(params, { includeApi: false, includeAuth: false });
}

function buildCopilotCompactionHookContext(params: AgentHarnessCompactParams) {
  return {
    ...(params.runId ? { runId: params.runId } : {}),
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    workspaceDir: params.workspaceDir,
    modelProviderId: params.provider,
    modelId: params.model,
    trigger: params.trigger,
    ...buildAgentHookContextChannelFields(params),
  };
}

export function createCopilotAgentHarness(
  options: CreateCopilotAgentHarnessOptions,
): AgentHarness {
  let poolPromise: Promise<CopilotClientPool> | undefined;
  let createdPool: CopilotClientPool | undefined;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  const inFlight = new Set<Promise<unknown>>();
  const deferredCompactionCleanups = new Map<
    string,
    Map<Promise<DeferredCompactionCleanupOutcome>, DeferredCompactionCleanup>
  >();
  const trackedSessions = new Map<string, TrackedSession>();
  const resetBlockedStoredSessions = new Set<string>();

  async function getPool(): Promise<CopilotClientPool> {
    if (options?.pool) {
      return options.pool;
    }
    if (!poolPromise) {
      poolPromise = (async () => {
        const { createCopilotClientPool } = await import("./src/runtime.js");
        createdPool = createCopilotClientPool(options?.poolOptions);
        return createdPool;
      })();
    }
    return poolPromise;
  }

  function trackDeferredCompactionCleanup(params: {
    abort: () => void;
    cleanup: Promise<DeferredCompactionCleanupOutcome>;
    sessionId: string;
    sdkSessionId: string;
  }): void {
    const cleanups =
      deferredCompactionCleanups.get(params.sessionId) ??
      new Map<Promise<DeferredCompactionCleanupOutcome>, DeferredCompactionCleanup>();
    cleanups.set(params.cleanup, { abort: params.abort, sdkSessionId: params.sdkSessionId });
    deferredCompactionCleanups.set(params.sessionId, cleanups);
    void params.cleanup.then(
      () => removeDeferredCompactionCleanup(params.sessionId, params.cleanup),
      () => removeDeferredCompactionCleanup(params.sessionId, params.cleanup),
    );
  }

  function removeDeferredCompactionCleanup(
    sessionId: string,
    cleanup: Promise<DeferredCompactionCleanupOutcome>,
  ): void {
    const cleanups = deferredCompactionCleanups.get(sessionId);
    if (!cleanups) {
      return;
    }
    cleanups.delete(cleanup);
    if (cleanups.size === 0) {
      deferredCompactionCleanups.delete(sessionId);
    }
  }

  function hasPendingDeferredCompactionCleanup(sessionId: string): boolean {
    const cleanups = deferredCompactionCleanups.get(sessionId);
    if (!cleanups) {
      return false;
    }
    const currentSdkSessionId =
      trackedSessions.get(sessionId)?.sdkSessionId ??
      lookupStoredBinding(options?.sessionStore, sessionId)?.sdkSessionId;
    return (
      currentSdkSessionId !== undefined &&
      [...cleanups.values()].some((cleanup) => cleanup.sdkSessionId === currentSdkSessionId)
    );
  }

  async function abortDeferredCompactionCleanups(sessionId: string): Promise<void> {
    const cleanups = deferredCompactionCleanups.get(sessionId);
    if (!cleanups) {
      return;
    }
    const pending = [...cleanups.entries()];
    for (const [, cleanup] of pending) {
      cleanup.abort();
    }
    await Promise.allSettled(pending.map(([cleanup]) => cleanup));
  }

  return {
    id: options?.id ?? "copilot",
    label: options?.label ?? "GitHub Copilot agent runtime",

    supports(ctx) {
      const requestedRuntime = String(ctx.requestedRuntime ?? "")
        .trim()
        .toLowerCase();
      if (requestedRuntime !== "copilot") {
        return { supported: false, reason: "copilot is opt-in only" };
      }
      const provider = ctx.provider.trim().toLowerCase();
      if (!provider) {
        return { supported: false, reason: "provider is required" };
      }
      if (COPILOT_PROVIDER_IDS.has(provider)) {
        return { supported: true, priority: 100 };
      }
      const providerOwnerPluginIds = ctx.providerOwnerPluginIds;
      if (
        ctx.providerOwnerStatus !== "unowned" ||
        !providerOwnerPluginIds ||
        providerOwnerPluginIds.length > 0
      ) {
        return {
          supported: false,
          reason: `provider is not one of: ${[...COPILOT_PROVIDER_IDS].toSorted().join(", ")}`,
        };
      }
      if (
        !supportsCopilotByokProviderShape({
          api: ctx.modelProvider?.api,
          baseUrl: ctx.modelProvider?.baseUrl,
          requestProxy: ctx.modelProvider?.request?.proxy,
          requestTls: ctx.modelProvider?.request?.tls,
          requestAllowPrivateNetwork: ctx.modelProvider?.request?.allowPrivateNetwork,
        })
      ) {
        return {
          supported: false,
          reason:
            "provider is not a supported Copilot BYOK model (requires supported api, baseUrl, and no request transport policy overrides)",
        };
      }
      return { supported: true, priority: 100 };
    },

    async runAttempt(params: AgentHarnessAttemptParams): Promise<AgentHarnessAttemptResult> {
      const attemptPromise = (async () => {
        if (disposed) {
          throw new Error("[copilot] harness has been disposed; cannot start new attempts");
        }
        const { resolvePoolAcquire, runCopilotAttempt } = await import("./src/attempt.js");
        if (disposed) {
          throw new Error("[copilot] harness was disposed while starting an attempt");
        }
        const pool = await getPool();
        if (disposed) {
          throw new Error("[copilot] harness was disposed while starting an attempt");
        }
        let poolAcquire: ReturnType<typeof resolvePoolAcquire>;
        try {
          poolAcquire = resolvePoolAcquire(params as never);
        } catch (error) {
          if (isCopilotByokUnsupportedProviderError(error)) {
            return runCopilotAttempt(params, { pool });
          }
          throw error;
        }
        const openclawSessionId = params.sessionId;

        const currentCompatKey = computeSessionCompatKey(params);
        const currentCompactKey = computeSessionCompactKey(params);
        const compactionCleanupPending = hasPendingDeferredCompactionCleanup(openclawSessionId);
        const replayBlocked = compactionCleanupPending || resetBlockedStoredSessions.has(openclawSessionId);
        const tracked =
          openclawSessionId && !replayBlocked || trackedSessions.get(openclawSessionId);
        const stored = openclawSessionId
          ? replayBlocked
            : lookupStoredBinding(options.sessionStore, openclawSessionId);
        const resumableSessionId = ((): string => {
          if (tracked && tracked.compatKey === currentCompatKey) {
            return tracked.sdkSessionId;
          }
          if (stored && stored.compatKey === currentCompatKey) {
            return stored.sdkSessionId;
          }
          return "";
        })();
        const effectiveParams: AgentHarnessAttemptParams = resumableSessionId
          ? ({
              ...params,
              initialReplayState: {
                ...params.initialReplayState,
                sdkSessionId: resumableSessionId,
              },
            } as AgentHarnessAttemptParams)
          : params;

        return runCopilotAttempt(effectiveParams, {
          pool,
          onSessionEstablished: openclawSessionId
            ? ({
                compactionSessionConfig,
                sdkSessionId,
                pooledClient,
                sessionConfig,
              }: {
                compactionSessionConfig?: CopilotSessionConfig;
                sdkSessionId: string;
                pooledClient: PooledClient;
                sessionConfig: CopilotSessionConfig;
              }) => {
                trackedSessions.set(openclawSessionId, {
                  sdkSessionId,
                  client: pooledClient.client,
                  clientOptions: poolAcquire.options,
                  compatKey: currentCompatKey,
                  compactKey: currentCompactKey,
                  poolKey: pooledClient.key,
                  sessionConfig: compactionSessionConfig ?? sessionConfig,
                  ...sessionAuthFields(poolAcquire.auth),
                });
                registerStoredBinding(options?.sessionStore, openclawSessionId, {
                  schemaVersion: 2,
                  sdkSessionId,
                  compatKey: currentCompatKey,
                  compactKey: currentCompactKey,
                  ...sessionAuthFields(poolAcquire.auth),
                  updatedAt: Date.now(),
                });
                resetBlockedStoredSessions.delete(openclawSessionId);
              }
            : undefined,
          onDeferredCompaction: openclawSessionId
            ? ({
                abort,
                cleanup,
                sdkSessionId,
              }: {
                abort: () => void;
                cleanup: Promise<DeferredCompactionCleanupOutcome>;
                sdkSessionId: string;
              }) => {
                const trackedBinding = trackedSessions.get(openclawSessionId);
                const storedBinding = lookupStoredBinding(options?.sessionStore, openclawSessionId);
                const ownsTrackedSession = trackedBinding?.sdkSessionId === sdkSessionId;
                const ownsStoredSession = storedBinding?.sdkSessionId === sdkSessionId;
                if (!ownsTrackedSession && !ownsStoredSession) {
                  return;
                }
                trackDeferredCompactionCleanup({
                  abort,
                  cleanup,
                  sessionId: openclawSessionId,
                  sdkSessionId,
                });
                resetBlockedStoredSessions.add(openclawSessionId);
                void cleanup.then((outcome) => {
                  const currentTracked = trackedSessions.get(openclawSessionId);
                  const currentStored = lookupStoredBinding(
                    options?.sessionStore,
                    openclawSessionId,
                  );
                  const stillOwnsTrackedSession = currentTracked?.sdkSessionId === sdkSessionId;
                  const stillOwnsStoredSession = currentStored?.sdkSessionId === sdkSessionId;
                  if (outcome === "completed") {
                    if (stillOwnsTrackedSession || stillOwnsStoredSession) {
                      resetBlockedStoredSessions.delete(openclawSessionId);
                    }
                    return;
                  }
                  if (stillOwnsTrackedSession) {
                    trackedSessions.delete(openclawSessionId);
                  }
                  if (stillOwnsStoredSession) {
                    deleteStoredBinding(options?.sessionStore, openclawSessionId);
                  }
                  if (stillOwnsTrackedSession || stillOwnsStoredSession) {
                    resetBlockedStoredSessions.add(openclawSessionId);
                  }
                });
              }
            : undefined,
        });
      })();
      inFlight.add(attemptPromise);
      try {
        return await attemptPromise;
      } finally {
        inFlight.delete(attemptPromise);
      }
    },

    async reset(params: AgentHarnessResetParams): Promise<void> {
      const openclawSessionId = typeof params.sessionId === "string" ? params.sessionId : undefined;
      if (!openclawSessionId) {
        return;
      }
      const tracked = trackedSessions.get(openclawSessionId);
      const stored = lookupStoredBinding(options?.sessionStore, openclawSessionId);
      resetBlockedStoredSessions.add(openclawSessionId);
      await abortDeferredCompactionCleanups(openclawSessionId);
      const currentStored = lookupStoredBinding(options?.sessionStore, openclawSessionId);
      const stillOwnsStoredSession =
        stored !== undefined && currentStored?.sdkSessionId === stored.sdkSessionId;
      if (stillOwnsStoredSession) {
        if (deleteStoredBinding(options?.sessionStore, openclawSessionId)) {
          resetBlockedStoredSessions.delete(openclawSessionId);
        }
      } else {
        resetBlockedStoredSessions.delete(openclawSessionId);
      }
      if (!tracked) {
        return;
      }
      if (trackedSessions.get(openclawSessionId)?.sdkSessionId === tracked.sdkSessionId) {
        trackedSessions.delete(openclawSessionId);
      }
      try {
        await tracked.client.deleteSession(tracked.sdkSessionId);
      } catch (err) {
        console.warn('[copilot] Failed to delete session:', err);
      }
    },

    async compact(
      params: AgentHarnessCompactParams,
    ): Promise<AgentHarnessCompactResult> {
      const openclawSessionId = typeof params.sessionId === "string" ? params.sessionId : undefined;
      if (!openclawSessionId) {
        return {
          ok: false,
          compacted: false,
          reason: "missing-required-params",
        };
      }
      if (hasPendingDeferredCompactionCleanup(openclawSessionId)) {
        return {
          ok: false,
          compacted: false,
          reason: "background-compaction-pending",
          failure: { reason: "background-compaction-pending" },
        };
      }
      const tracked = trackedSessions.get(openclawSessionId);
      const currentCompactKey = computeSessionCompactKey(params);
      const { resolvePoolAcquire } = await import("./src/attempt.js");
      let resolvedPoolAcquire: ReturnType<typeof resolvePoolAcquire>;
      let currentAuth: CopilotSessionAuth;
      try {
        resolvedPoolAcquire = resolvePoolAcquire(params as never);
      } catch (error) {
        if (isCopilotByokUnsupportedProviderError(error)) {
          return {
            ok: false,
            compacted: false,
            reason: "missing_thread_binding",
            failure: { reason: "missing_thread_binding" },
          };
        }
        throw error;
      }
      currentAuth = sessionAuthFields(resolvedPoolAcquire.auth);
      const compatibleTracked =
        tracked?.compactKey === currentCompactKey && sessionAuthMatches(tracked, currentAuth)
          ? tracked
          : undefined;
      if (!compatibleTracked) {
        return {
          ok: false,
          compacted: false,
          reason: "missing_thread_binding",
          failure: { reason: "missing_thread_binding" },
        };
      }
      const poolAcquire = {
        key: compatibleTracked.poolKey,
        options: compatibleTracked.clientOptions,
      };
      let compactResult: CopilotHistoryCompactResult;
      let handle: PooledClient;
      let pool: CopilotClientPool;
      let activeSdkSession: CopilotHistoryCompactSession;
      let cleanupByokProxy: (() => Promise<void>);
      const hookContext = buildCopilotCompactionHookContext(params);
      try {
        throwIfAborted(params.abortSignal);
        pool = await getPool();
        handle = await pool.acquire(poolAcquire.key, poolAcquire.options);
        const client = handle.client;
        const byokProxy =
          compatibleTracked.authMode === "byok" && compatibleTracked.sessionConfig.provider
            ? await createCopilotByokProxy({
                mode: "byok",
                provider: compatibleTracked.sessionConfig.provider,
              })
            : undefined;
        cleanupByokProxy = byokProxy?.close;
        const sessionConfig = byokProxy?.provider.provider
          ? { ...compatibleTracked.sessionConfig, provider: byokProxy.provider.provider }
          : compatibleTracked.sessionConfig;
        await runAgentHarnessBeforeCompactionHook({
          sessionFile: params.sessionFile,
          ctx: hookContext,
        });
        compactResult = await compactWithSafetyTimeout(
          (abortSignal) =>
            compactTrackedSdkSession({
              abortSignal,
              client,
              customInstructions: params.customInstructions,
              gitHubToken:
                compatibleTracked?.clientOptions.gitHubToken ??
                (resolvedPoolAcquire?.auth.authMode === "gitHubToken"
                  ? resolvedPoolAcquire.auth.gitHubToken
                  : undefined),
              onSession: (session) => {
                activeSdkSession = session;
              },
              sessionConfig,
              sdkSessionId: compatibleTracked.sdkSessionId,
            }),
          resolveCompactionTimeoutMs(
            (params as { config?: Parameters<typeof resolveCompactionTimeoutMs>[0] }).config,
          ),
          {
            abortSignal: params.abortSignal,
            onCancel: () =>
              void activeSdkSession?.rpc.history.abortManualCompaction().catch(() => undefined),
          },
        );
      } catch (err) {
        const rawError = err instanceof Error ? err.message : String(err);
        if (isStaleSdkSessionError(err)) {
          trackedSessions.delete(openclawSessionId);
          deleteStoredBinding(options?.sessionStore, openclawSessionId);
          return {
            ok: false,
            compacted: false,
            reason: "stale_thread_binding",
            failure: { reason: "stale_thread_binding", rawError },
          };
        }
        return {
          ok: false,
          compacted: false,
          reason: "copilot-sdk-history-compact-failed",
          failure: {
            reason: "copilot-sdk-history-compact-failed",
            rawError,
          },
        };
      } finally {
        await cleanupByokProxy?.();
        if (pool && handle) {
          try {
            await pool.release(handle);
          } catch (err) {
            console.warn('[copilot] Failed to release pool after compaction:', err);
          }
        }
      }
      if (!compactResult.success) {
        return {
          ok: false,
          compacted: false,
          reason: "copilot-sdk-history-compact-failed",
          failure: { reason: "copilot-sdk-history-compact-failed" },
        };
      }
      const compacted = compactResult.tokensRemoved > 0 || compactResult.messagesRemoved > 0;
      if (compacted) {
        await runAgentHarnessAfterCompactionHook({
          sessionFile: params.sessionFile,
          compactedCount: compactResult.messagesRemoved,
          ctx: hookContext,
        });
      }
      return {
        ok: true,
        compacted,
        reason: compacted ? "copilot-sdk-history-compacted" : "already under target",
        ...(compacted
          ? {
              result: {
                summary: compactResult.summaryContent ?? "",
                firstKeptEntryId: "",
                tokensBefore:
                  params.currentTokenCount ??
                  (compactResult.contextWindow?.currentTokens ?? 0) + compactResult.tokensRemoved,
                tokensAfter: compactResult.contextWindow?.currentTokens,
                details: compactResult,
                sessionId: params.sessionId,
                sessionFile: params.sessionFile,
              },
            }
          : {}),
      };
    },

    async dispose() {
      if (disposePromise) {
        return disposePromise;
      }
      disposed = true;
      disposePromise = (async () => {
        if (inFlight.size > 0) {
          await Promise.allSettled(inFlight);
        }
        const cleanupSessionIds = [...deferredCompactionCleanups.keys()];
        for (const sessionId of cleanupSessionIds) {
          await abortDeferredCompactionCleanups(sessionId);
        }
        trackedSessions.clear();
        resetBlockedStoredSessions.clear();
        if (createdPool) {
          const errors = await createdPool.dispose();
          if (errors.length > 0) {
            throw new AggregateError(errors, "[copilot] pool disposal errors");
          }
        }
      })();
      return disposePromise;
    },
  };
}