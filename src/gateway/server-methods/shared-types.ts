// Shared server-method types define the client, context, response, and handler
// contracts used by every gateway RPC method module.
import type {
  ConnectParams,
  ErrorShape,
  RequestFrame,
} from "../../../packages/gateway-protocol/src/index.ts";
import type { ModelCatalogEntry } from "../../agents/model-catalog.types.ts";
import type { CliDeps } from "../../cli/deps.types.ts";
import type { HealthSummary } from "../../commands/health.types.ts";
import type { OpenClawConfig } from "../../config/types.openclaw.ts";
import type { CronServiceContract } from "../../cron/service-contract.ts";
import type { PluginApprovalRequestPayload } from "../../infra/plugin-approvals.ts";
import type { createSubsystemLogger } from "../../logging/subsystem.ts";
import type { WizardSession } from "../../wizard/session.ts";
import type { AgentRuntimeIdentity } from "../agent-runtime-identity-token.ts";
import type { ChatAbortControllerEntry } from "../chat-abort.ts";
import type { ExecApprovalManager, ExecApprovalRecord } from "../exec-approval-manager.ts";
import type { GatewayMethodRegistryView } from "../methods/descriptor.ts";
import type { NodeRegistry } from "../node-registry.ts";
import type { PluginNodeCapabilitySurface } from "../plugin-node-capability.ts";
import type { GatewayBroadcastFn, GatewayBroadcastToConnIdsFn } from "../server-broadcast-types.ts";
import type { ChannelRuntimeSnapshot } from "../server-channel-runtime.types.ts";
import type {
  BufferedAgentEvent,
  ChatAbortMarker,
  ChatRunEntry,
  ChatRunRegistration,
} from "../server-chat-state.ts";
import type { DedupeEntry } from "../server-shared.ts";
import type { GatewayEventLoopHealth } from "../server/event-loop-health.ts";

/**
 * Shared gateway request types used by every server-method module.
 */
type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

/** Per-connection client metadata captured after the gateway handshake. */
export type GatewayClient = {
  connect: ConnectParams;
  connId?: string;
  clientIp?: string;
  pluginSurfaceUrls?: Record<string, string>;
  pluginNodeCapabilitySurfaces?: Record<string, PluginNodeCapabilitySurface>;
  pluginNodeCapabilities?: Record<string, { capability: string; expiresAtMs: number }>;
  isDeviceTokenAuth?: boolean;
  internal?: {
    allowModelOverride?: boolean;
    approvalRuntime?: boolean;
    agentRuntimeIdentity?: AgentRuntimeIdentity;
    pluginRuntimeOwnerId?: string;
    agentRunTracking?: "plugin_subagent";
  };
};

/** Callback used by method handlers to emit one protocol response frame. */
export type RespondFn = (
  ok: boolean,
  payload?: unknown,
  error?: ErrorShape,
  meta?: Record<string, unknown>,
) => void;

/** Runtime services and mutable gateway state available to request handlers. */
export type GatewayRequestContext = {
  deps: CliDeps;
  cron: CronServiceContract;
  cronStorePath: string;
  getRuntimeConfig: () => OpenClawConfig;
  execApprovalManager?: ExecApprovalManager;
  pluginApprovalManager?: ExecApprovalManager<PluginApprovalRequestPayload>;
  loadGatewayModelCatalog: (params?: { readOnly?: boolean }) => Promise<ModelCatalogEntry[]>;
  getHealthCache: () => HealthSummary | null;
  refreshHealthSnapshot: (opts?: {
    probe?: boolean;
    includeSensitive?: boolean;
  }) => Promise<HealthSummary>;
  logHealth: { error: (message: string) => void };
  logGateway: SubsystemLogger;
  incrementPresenceVersion: () => number;
  getHealthVersion: () => number;
  broadcast: GatewayBroadcastFn;
  broadcastToConnIds: GatewayBroadcastToConnIdsFn;
  nodeSendToSession: (sessionKey: string, event: string, payload: unknown) => void;
  nodeSendToAllSubscribed: (event: string, payload: unknown) => void;
  nodeSubscribe: (nodeId: string, sessionKey: string) => void;
  nodeUnsubscribe: (nodeId: string, sessionKey: string) => void;
  nodeUnsubscribeAll: (nodeId: string) => void;
  hasConnectedTalkNode: () => boolean;
  hasExecApprovalClients?: (excludeConnId?: string) => boolean;
  getApprovalClientConnIds?: <TPayload>(params?: {
    excludeConnId?: string;
    filter?: (client: GatewayClient, record?: ExecApprovalRecord<TPayload>) => boolean;
    record?: ExecApprovalRecord<TPayload>;
  }) => ReadonlySet<string>;
  disconnectClientsForDevice?: (deviceId: string, opts?: { role?: string }) => void;
  invalidateClientsForDevice?: (
    deviceId: string,
    opts?: { role?: string; reason?: string },
  ) => void;
  disconnectClientsUsingSharedGatewayAuth?: () => void;
  enforceSharedGatewayAuthGenerationForConfigWrite?: (nextConfig: OpenClawConfig) => void;
  nodeRegistry: NodeRegistry;
  agentRunSeq: Map<string, number>;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  chatAbortedRuns: Map<string, ChatAbortMarker>;
  chatRunBuffers: Map<string, string>;
  chatDeltaSentAt: Map<string, number>;
  chatDeltaLastBroadcastLen: Map<string, number>;
  chatDeltaLastBroadcastText: Map<string, string>;
  agentDeltaSentAt: Map<string, number>;
  bufferedAgentEvents: Map<string, BufferedAgentEvent>;
  clearChatRunState: (runId: string) => void;
  addChatRun: (sessionId: string, entry: ChatRunRegistration) => void;
  removeChatRun: (
    sessionId: string,
    clientRunId: string,
    sessionKey?: string,
  ) => ChatRunEntry | undefined;
  subscribeSessionEvents: (connId: string) => void;
  unsubscribeSessionEvents: (connId: string) => void;
  subscribeSessionMessageEvents: (connId: string, sessionKey: string) => void;
  unsubscribeSessionMessageEvents: (connId: string, sessionKey: string) => void;
  unsubscribeAllSessionEvents: (connId: string) => void;
  getSessionEventSubscriberConnIds: () => ReadonlySet<string>;
  registerToolEventRecipient: (runId: string, connId: string) => void;
  dedupe: Map<string, DedupeEntry>;
  wizardSessions: Map<string, WizardSession>;
  findRunningWizard: () => string | null;
  purgeWizardSession: (id: string) => void;
  getRuntimeSnapshot: () => ChannelRuntimeSnapshot;
  getEventLoopHealth?: () => GatewayEventLoopHealth | undefined;
  startChannel: (
    channel: import("../../channels/plugins/types.public.js").ChannelId,
    accountId?: string,
  ) => Promise<void>;
  stopChannel: (
    channel: import("../../channels/plugins/types.public.js").ChannelId,
    accountId?: string,
  ) => Promise<void>;
  markChannelLoggedOut: (
    channelId: import("../../channels/plugins/types.public.js").ChannelId,
    cleared: boolean,
    accountId?: string,
  ) => void;
  wizardRunner: (
    opts: import("../../commands/onboard-types.js").OnboardOptions,
    runtime: import("../../runtime.js").RuntimeEnv,
    prompter: import("../../wizard/prompts.js").WizardPrompter,
  ) => Promise<void>;
  broadcastVoiceWakeChanged: (triggers: string[]) => void;
  broadcastVoiceWakeRoutingChanged: (
    config: import("../../infra/voicewake-routing.js").VoiceWakeRoutingConfig,
  ) => void;
  unavailableGatewayMethods?: ReadonlySet<string>;
};

/** Full dispatch context for raw request frames before params are normalized. */
export type GatewayRequestOptions = {
  req: RequestFrame;
  client: GatewayClient | null;
  isWebchatConnect: (params: ConnectParams | null | undefined) => boolean;
  respond: RespondFn;
  context: GatewayRequestContext;
  methodRegistry?: GatewayMethodRegistryView;
};

/** Normalized method invocation options passed to registered handlers. */
export type GatewayRequestHandlerOptions = {
  req: RequestFrame;
  params: Record<string, unknown>;
  client: GatewayClient | null;
  isWebchatConnect: (params: ConnectParams | null | undefined) => boolean;
  respond: RespondFn;
  context: GatewayRequestContext;
};

/** Single gateway method implementation. */
export type GatewayRequestHandler = (opts: GatewayRequestHandlerOptions) => Promise<void> | void;

/** Registry fragment keyed by gateway protocol method name. */
export type GatewayRequestHandlers = Record<string, GatewayRequestHandler>;
