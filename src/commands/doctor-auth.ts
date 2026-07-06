// Doctor notes for auth profile health, OAuth refresh failures.
import path from "node:path";
import { note } from "../../packages/terminal-core/src/note.ts";
import {
  listAgentIds,
  resolveAgentDir,
  resolveDefaultAgentDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.ts";
import {
  buildAuthHealthSummary,
  DEFAULT_OAUTH_WARN_MS,
  formatRemainingShort,
} from "../agents/auth-health.ts";
import {
  type AuthCredentialReasonCode,
  ensureAuthProfileStore,
  hasAnyAuthProfileStoreSource,
  hasLocalAuthProfileStoreSource,
  resolveApiKeyForProfile,
  resolveProfileUnusableUntilForDisplay,
} from "../agents/auth-profiles.ts";
import { formatAuthDoctorHint } from "../agents/auth-profiles/doctor.ts";
import {
  buildOAuthRefreshFailureLoginCommand,
  classifyOAuthRefreshFailure,
  type OAuthRefreshFailureReason,
} from "../agents/auth-profiles/oauth-refresh-failure.ts";
import { buildProviderAuthRecoveryHint } from "../agents/provider-auth-recovery-hint.ts";
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import { formatErrorMessage } from "../infra/errors.ts";
import type { DoctorPrompter } from "./doctor-prompter.ts";

const DOCTOR_REAUTH_PROVIDER_ALIASES: Readonly<Record<string, string>> = {};

type AuthIssue = {
  profileId: string;
  provider: string;
  status: string;
  reasonCode?: AuthCredentialReasonCode;
  remainingMs?: number;
};

type AuthProfileHealthTarget = {
  agentId: string;
  agentDir: string;
  isDefault: boolean;
};

function formatAgentNoteTitle(title: string, agentId: string, labelAgents: boolean): string {
  return labelAgents ? `${title} (agent: ${agentId})` : title;
}

function listAuthProfileHealthTargets(cfg: OpenClawConfig): AuthProfileHealthTarget[] {
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const targets = new Map<string, AuthProfileHealthTarget>();
  const addTarget = (agentId: string, agentDir: string, isDefault: boolean) => {
    const key = path.resolve(agentDir);
    const existing = targets.get(key);
    if (!existing || isDefault) {
      targets.set(key, { agentId, agentDir, isDefault: isDefault || existing?.isDefault === true });
    }
  };

  addTarget(defaultAgentId, resolveDefaultAgentDir(cfg), true);
  for (const agentId of listAgentIds(cfg)) {
    if (agentId === defaultAgentId) {
      continue;
    }
    const agentDir = resolveAgentDir(cfg, agentId);
    if (hasLocalAuthProfileStoreSource(agentDir)) {
      addTarget(agentId, agentDir, false);
    }
  }

  return [...targets.values()];
}

/** Returns the short doctor hint for disabled or cooldown auth profiles. */
export function resolveUnusableProfileHint(params: {
  kind: "cooldown" | "disabled";
  reason?: string;
}): string {
  if (params.kind === "disabled") {
    if (params.reason === "billing") {
      return "Top up credits (provider billing) or switch provider.";
    }
    if (params.reason === "auth_permanent" || params.reason === "auth") {
      return "Refresh or replace credentials, then retry.";
    }
  }
  return "Wait for cooldown or switch provider.";
}

function formatOAuthRefreshFailureReason(reason: OAuthRefreshFailureReason | null): string {
  switch (reason) {
    case "refresh_token_reused":
      return "refresh_token_reused";
    case "invalid_grant":
      return "invalid_grant";
    case "sign_in_again":
      return "sign in again";
    case "invalid_refresh_token":
      return "invalid refresh token";
    case "revoked":
      return "revoked";
    default:
      return "refresh failed";
  }
}

/** Formats provider OAuth refresh failures as actionable doctor note lines. */
export function formatOAuthRefreshFailureDoctorLine(params: {
  profileId: string;
  provider: string;
  message: string;
}): string | null {
  const classified = classifyOAuthRefreshFailure(params.message);
  if (!classified) {
    return null;
  }
  const rawProvider = classified.provider ?? params.provider;
  const provider = rawProvider
    ? (DOCTOR_REAUTH_PROVIDER_ALIASES[rawProvider] ?? rawProvider)
    : null;
  const command = buildOAuthRefreshFailureLoginCommand(provider);
  if (classified.reason) {
    return `- ${params.profileId}: re-auth required [${formatOAuthRefreshFailureReason(classified.reason)}] — Run \`${command}\`.`;
  }
  return `- ${params.profileId}: OAuth refresh failed — Try again; if this persists, run \`${command}\`.`;
}

async function resolveAuthIssueHint(
  issue: AuthIssue,
  cfg: OpenClawConfig,
  store: ReturnType<typeof ensureAuthProfileStore>,
): Promise<string | null> {
  if (issue.reasonCode === "invalid_expires") {
    return "Invalid token expires metadata. Set a future Unix ms timestamp or remove expires.";
  }
  if (issue.reasonCode === "malformed_api_key") {
    return "Paste the API key value, not an OpenClaw onboarding command.";
  }
  const providerHint = await formatAuthDoctorHint({
    cfg,
    store,
    provider: issue.provider,
    profileId: issue.profileId,
  });
  if (providerHint.trim()) {
    return providerHint;
  }
  return buildProviderAuthRecoveryHint({
    provider: issue.provider,
  }).replace(/^Run /, "Re-auth via ");
}

async function formatAuthIssueLine(
  issue: AuthIssue,
  cfg: OpenClawConfig,
  store: ReturnType<typeof ensureAuthProfileStore>,
): Promise<string> {
  const remaining =
    issue.remainingMs !== undefined ? ` (${formatRemainingShort(issue.remainingMs)})` : "";
  const hint = await resolveAuthIssueHint(issue, cfg, store);
  const reason = issue.reasonCode ? ` [${issue.reasonCode}]` : "";
  return `- ${issue.profileId}: ${issue.status}${reason}${remaining}${hint ? ` — ${hint}` : ""}`;
}

async function noteAuthProfileHealthForTarget(params: {
  cfg: OpenClawConfig;
  prompter: DoctorPrompter;
  allowKeychainPrompt: boolean;
  target: AuthProfileHealthTarget;
  labelAgents: boolean;
}): Promise<void> {
  const store = ensureAuthProfileStore(params.target.agentDir, {
    allowKeychainPrompt: params.allowKeychainPrompt,
  });
  const noteTitle = (title: string) =>
    formatAgentNoteTitle(title, params.target.agentId, params.labelAgents);
  const unusable = (() => {
    const now = Date.now();
    const out: string[] = [];
    for (const profileId of Object.keys(store.usageStats ?? {})) {
      const until = resolveProfileUnusableUntilForDisplay(store, profileId);
      if (!until || now >= until) {
        continue;
      }
      const stats = store.usageStats?.[profileId];
      const remaining = formatRemainingShort(until - now);
      const disabledActive = typeof stats?.disabledUntil === "number" && now < stats.disabledUntil;
      const kind = disabledActive
        ? `disabled${stats.disabledReason ? `:${stats.disabledReason}` : ""}`
        : "cooldown";
      const hint = resolveUnusableProfileHint({
        kind: disabledActive ? "disabled" : "cooldown",
        reason: stats?.disabledReason,
      });
      out.push(`- ${profileId}: ${kind} (${remaining})${hint ? ` — ${hint}` : ""}`);
    }
    return out;
  })();

  if (unusable.length > 0) {
    note(unusable.join("\n"), noteTitle("Auth profile cooldowns"));
  }

  let summary = buildAuthHealthSummary({
    store,
    cfg: params.cfg,
    warnAfterMs: DEFAULT_OAUTH_WARN_MS,
    allowKeychainPrompt: params.allowKeychainPrompt,
  });

  const findIssues = () =>
    summary.profiles.filter((profile) => {
      if (profile.type === "api_key") {
        return profile.status === "missing";
      }
      return (
        (profile.type === "oauth" || profile.type === "token") &&
        (profile.status === "expired" ||
          profile.status === "expiring" ||
          profile.status === "missing")
      );
    });

  let issues = findIssues();
  if (issues.length === 0) {
    return;
  }

  const refreshTargets = issues.filter(
    (issue) => issue.type === "oauth" && ["expired", "expiring", "missing"].includes(issue.status),
  );
  const shouldRefresh =
    refreshTargets.length > 0 &&
    (await params.prompter.confirmAutoFix({
      message: "Refresh expiring OAuth tokens now? (static tokens need re-auth)",
      initialValue: true,
    }));

  if (shouldRefresh) {
    const errors: string[] = [];
    for (const profile of refreshTargets) {
      try {
        await resolveApiKeyForProfile({
          cfg: params.cfg,
          store,
          profileId: profile.profileId,
          agentDir: params.target.agentDir,
        });
      } catch (err) {
        const message = formatErrorMessage(err);
        errors.push(
          formatOAuthRefreshFailureDoctorLine({
            profileId: profile.profileId,
            provider: profile.provider,
            message,
          }) ?? `- ${profile.profileId}: ${message}`,
        );
      }
    }
    if (errors.length > 0) {
      note(errors.join("\n"), noteTitle("OAuth refresh errors"));
    }
    summary = buildAuthHealthSummary({
      store: ensureAuthProfileStore(params.target.agentDir, {
        allowKeychainPrompt: false,
      }),
      cfg: params.cfg,
      warnAfterMs: DEFAULT_OAUTH_WARN_MS,
      allowKeychainPrompt: false,
    });
    issues = findIssues();
  }

  if (issues.length > 0) {
    const issueLines = await Promise.all(
      issues.map((issue) =>
        formatAuthIssueLine(
          {
            profileId: issue.profileId,
            provider: issue.provider,
            status: issue.status,
            reasonCode: issue.reasonCode,
            remainingMs: issue.remainingMs,
          },
          params.cfg,
          store,
        ),
      ),
    );
    note(issueLines.join("\n"), noteTitle("Model auth"));
  }
}

/** Checks configured agent auth stores and emits doctor notes for stale or unusable profiles. */
export async function noteAuthProfileHealth(params: {
  cfg: OpenClawConfig;
  prompter: DoctorPrompter;
  allowKeychainPrompt: boolean;
}): Promise<void> {
  const configuredProfiles = Object.keys(params.cfg.auth?.profiles ?? {}).length > 0;
  const targets = listAuthProfileHealthTargets(params.cfg);
  const activeTargets = targets.filter((target) =>
    target.isDefault
      ? hasAnyAuthProfileStoreSource(target.agentDir) || configuredProfiles
      : hasLocalAuthProfileStoreSource(target.agentDir),
  );
  if (activeTargets.length === 0) {
    return;
  }

  const labelAgents = activeTargets.length > 1;
  for (const target of activeTargets) {
    await noteAuthProfileHealthForTarget({
      ...params,
      target,
      labelAgents,
    });
  }
}