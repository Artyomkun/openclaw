// Doctor core checks — simplified
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.ts";
import {
  hasConfiguredCommandOwners
} from "../commands/doctor-command-owner.ts";
import {
  disableUnavailableSkillsInConfig,
  formatMissingSkillSummary,
} from "../commands/doctor-skills-core.ts";
import { collectDisabledCodexPluginRouteIssues } from "../commands/doctor/shared/codex-route-warnings.ts";
import type { ConfigValidationIssue, OpenClawConfig } from "../config/types.openclaw.ts";
import { resolveSecretInputRef, type SecretRef } from "../config/types.secrets.ts";
import { hasAmbiguousGatewayAuthModeConfig } from "../gateway/auth-mode-policy.ts";
import { resolveGatewayAuthToken } from "../gateway/auth-token-resolution.ts";
import { resolveGatewayAuth } from "../gateway/auth.ts";
import { getSkippedExecRefStaticError } from "../secrets/exec-resolution-policy.ts";
import type { SkillStatusEntry } from "../skills/discovery/status.ts";
import type { HealthCheck, HealthFinding } from "./health-checks.ts";

export type CoreHealthCheckDeps = {
  detectUnavailableSkills: (cfg: OpenClawConfig) => Promise<readonly SkillStatusEntry[]>;
  collectSecurityWarnings: (cfg: OpenClawConfig) => Promise<readonly string[]>;
  collectWorkspaceSuggestions: (workspaceDir: string) => Promise<readonly string[]>;
  collectRuntimeToolSchemaFindings: (cfg: OpenClawConfig) => Promise<readonly HealthFinding[]>;
  collectProviderCatalogFindings: (cfg: OpenClawConfig) => Promise<readonly HealthFinding[]>;
  collectGatewayHealthFindings: (cfg: OpenClawConfig) => Promise<readonly HealthFinding[]>;
  collectGatewayDaemonFindings: (cfg: OpenClawConfig) => Promise<readonly HealthFinding[]>;
};

function resolveDoctorMode(cfg: OpenClawConfig): "local" | "remote" {
  return cfg.gateway?.mode === "remote" ? "remote" : "local";
}

function configValidationIssuesToHealthFindings(
  issues: readonly ConfigValidationIssue[],
): readonly HealthFinding[] {
  return issues.map(
    (issue): HealthFinding => ({
      checkId: "core/doctor/final-config-validation",
      severity: "error",
      message: issue.message,
      path: issue.path || "<root>",
    }),
  );
}

function noteToFinding(
  checkId: string,
  severity: HealthFinding["severity"],
  text: string,
): HealthFinding {
  const lines = text.split("\n");
  const first = lines[0]?.replace(/^- /, "").trim() || text;
  const rest = lines.slice(1).join("\n");
  return {
    checkId,
    severity,
    message: first,
    ...(rest ? { fixHint: rest } : {}),
  };
}

function buildGatewayTokenSecretRefUnavailableMessage(params: {
  cfg: OpenClawConfig;
  ref: SecretRef;
  unresolvedRefReason?: string;
}): string {
  if (params.unresolvedRefReason) {
    return `Gateway token SecretRef could not be resolved: ${params.unresolvedRefReason}`;
  }
  if (params.ref.source === "exec") {
    const staticError = getSkippedExecRefStaticError({ ref: params.ref, config: params.cfg });
    if (staticError) return `Gateway token SecretRef could not be verified: ${staticError}`;
    return "Gateway token SecretRef uses an exec provider and did not resolve.";
  }
  return "Gateway token is managed via SecretRef and is currently unavailable.";
}

const gatewayConfigCheck: HealthCheck = {
  id: "core/doctor/gateway-config",
  kind: "core",
  description: "gateway.mode is set and auth is unambiguous.",
  source: "doctor",
  async detect(ctx) {
    const findings: HealthFinding[] = [];
    if (!ctx.cfg.gateway?.mode) {
      findings.push({
        checkId: "core/doctor/gateway-config",
        severity: "warning",
        message: "gateway.mode is unset; gateway start will be blocked.",
        path: "gateway.mode",
        fixHint:
          "Run `openclaw configure` and set Gateway mode, or `openclaw config set gateway.mode local`.",
      });
    }
    if (ctx.cfg.gateway?.mode !== "remote" && hasAmbiguousGatewayAuthModeConfig(ctx.cfg)) {
      findings.push({
        checkId: "core/doctor/gateway-config",
        severity: "warning",
        message:
          "gateway.auth.token and gateway.auth.password are both configured while gateway.auth.mode is unset.",
        path: "gateway.auth.mode",
        fixHint:
          "Set an explicit mode: `openclaw config set gateway.auth.mode token` or `... password`.",
      });
    }
    return findings;
  },
};

const commandOwnerCheck: HealthCheck = {
  id: "core/doctor/command-owner",
  kind: "core",
  description: "An owner account is configured for owner-only commands.",
  source: "doctor",
  async detect(ctx) {
    if (hasConfiguredCommandOwners(ctx.cfg)) return [];
    return [
      {
        checkId: "core/doctor/command-owner",
        severity: "info",
        message:
          "No command owner is configured. Owner-only commands have no allowed sender.",
        path: "commands.ownerAllowFrom",
        fixHint:
          "Set commands.ownerAllowFrom to your channel user id, e.g. `openclaw config set commands.ownerAllowFrom '[\"telegram:123456789\"]'`.",
      },
    ];
  },
};

const gatewayAuthCheck: HealthCheck = {
  id: "core/doctor/gateway-auth",
  kind: "core",
  description: "Local Gateway auth has a usable token or explicit mode.",
  source: "doctor",
  async detect(ctx) {
    if (resolveDoctorMode(ctx.cfg) !== "local") return [];

    const gatewayTokenRef = resolveSecretInputRef({
      value: ctx.cfg.gateway?.auth?.token,
      defaults: ctx.cfg.secrets?.defaults,
    }).ref;
    const auth = resolveGatewayAuth({
      authConfig: ctx.cfg.gateway?.auth,
      tailscaleMode: ctx.cfg.gateway?.tailscale?.mode ?? "off",
    });
    const hasInlineToken = typeof auth.token === "string" && auth.token.trim() !== "";
    const needsToken =
      auth.mode !== "password" &&
      auth.mode !== "none" &&
      auth.mode !== "trusted-proxy" &&
      (auth.mode !== "token" || !hasInlineToken || Boolean(gatewayTokenRef));
    if (!needsToken) return [];

    let unresolvedRefReason: string | undefined;
    if (gatewayTokenRef && gatewayTokenRef.source === "exec") {
      const staticError = getSkippedExecRefStaticError({ ref: gatewayTokenRef, config: ctx.cfg });
      if (staticError) {
        unresolvedRefReason = undefined;
      } else if (ctx.allowExecSecretRefs !== true) {
        return [];
      } else {
        const resolvedToken = await resolveGatewayAuthToken({
          cfg: ctx.cfg,
          env: process.env,
          unresolvedReasonStyle: "detailed",
          envFallback: "never",
        });
        if (resolvedToken.source === "secretRef") return [];
        unresolvedRefReason = resolvedToken.unresolvedRefReason;
      }
    } else {
      const resolvedToken = await resolveGatewayAuthToken({
        cfg: ctx.cfg,
        env: process.env,
        unresolvedReasonStyle: "detailed",
        envFallback: gatewayTokenRef ? "never" : "always",
      });
      if (gatewayTokenRef ? resolvedToken.source === "secretRef" : resolvedToken.token) return [];
      unresolvedRefReason = resolvedToken.unresolvedRefReason;
    }

    if (gatewayTokenRef) {
      return [
        {
          checkId: "core/doctor/gateway-auth",
          severity: "warning",
          message: buildGatewayTokenSecretRefUnavailableMessage({
            cfg: ctx.cfg,
            ref: gatewayTokenRef,
            unresolvedRefReason,
          }),
          path: "gateway.auth.token",
          fixHint:
            "Run `openclaw doctor --allow-exec` to verify exec SecretRefs, or resolve the external secret.",
        },
      ];
    }
    return [
      {
        checkId: "core/doctor/gateway-auth",
        severity: "warning",
        message: "Gateway auth is off or missing a token.",
        path: "gateway.auth",
        fixHint: "Run `openclaw doctor --fix --generate-gateway-token` to generate a token.",
      },
    ];
  },
};

const claudeCliCheck: HealthCheck = {
  id: "core/doctor/claude-cli",
  kind: "core",
  description: "Claude CLI readiness is captured as structured findings.",
  source: "doctor",
  async detect(ctx) {
    const { noteClaudeCliHealth } = await import("../commands/doctor-claude-cli.js");
    const findings: HealthFinding[] = [];
    const noteFn = (msg: unknown) => {
      const text = typeof msg === "string" ? msg : String(msg);
      if (text.includes("Fix:")) {
        findings.push(
          noteToFinding("core/doctor/claude-cli", "warning", text)
        );
      }
    };
    noteClaudeCliHealth(ctx.cfg, { noteFn, workspaceDir: ctx.cwd });
    return findings;
  },
};

const hooksModelCheck: HealthCheck = {
  id: "core/doctor/hooks-model",
  kind: "core",
  description: "hooks.gmail.model resolves to an allowed catalog model.",
  source: "doctor",
  async detect(ctx) {
    if (!ctx.cfg.hooks?.gmail?.model?.trim()) return [];

    const { DEFAULT_MODEL, DEFAULT_PROVIDER } = await import("../agents/defaults.js");
    const { loadModelCatalog } = await import("../agents/model-catalog.js");
    const { getModelRefStatus, resolveConfiguredModelRef, resolveHooksGmailModel } =
      await import("../agents/model-selection.js");

    const hooksModelRef = resolveHooksGmailModel({
      cfg: ctx.cfg,
      defaultProvider: DEFAULT_PROVIDER,
    });
    if (!hooksModelRef) {
      return [
        {
          checkId: "core/doctor/hooks-model",
          severity: "warning",
          message: `hooks.gmail.model "${ctx.cfg.hooks.gmail.model}" could not be resolved.`,
          path: "hooks.gmail.model",
        },
      ];
    }
    const { provider: defaultProvider, model: defaultModel } = resolveConfiguredModelRef({
      cfg: ctx.cfg,
      defaultProvider: DEFAULT_PROVIDER,
      defaultModel: DEFAULT_MODEL,
    });
    const catalog = await loadModelCatalog({ config: ctx.cfg, readOnly: true });
    const status = getModelRefStatus({
      cfg: ctx.cfg,
      catalog,
      ref: hooksModelRef,
      defaultProvider,
      defaultModel,
    });

    const findings: HealthFinding[] = [];
    if (!status.allowed) {
      findings.push({
        checkId: "core/doctor/hooks-model",
        severity: "warning",
        message: `hooks.gmail.model "${status.key}" is not in agents.defaults.models allowlist.`,
        path: "hooks.gmail.model",
        fixHint: "Add the model to agents.defaults.models or remove hooks.gmail.model.",
      });
    }
    if (!status.inCatalog) {
      findings.push({
        checkId: "core/doctor/hooks-model",
        severity: "warning",
        message: `hooks.gmail.model "${status.key}" is not in the model catalog.`,
        path: "hooks.gmail.model",
        fixHint: "Choose a model from the configured provider catalog.",
      });
    }
    return findings;
  },
};

const bootstrapSizeCheck: HealthCheck = {
  id: "core/doctor/bootstrap-size",
  kind: "core",
  description: "Workspace bootstrap files fit within configured injection limits.",
  source: "doctor",
  async detect(ctx) {
    const { buildBootstrapInjectionStats, analyzeBootstrapBudget } =
      await import("../agents/bootstrap-budget.js");
    const { resolveBootstrapContextForRun } = await import("../agents/bootstrap-files.js");
    const { resolveBootstrapMaxChars, resolveBootstrapTotalMaxChars } =
      await import("../agents/embedded-agent-helpers.js");

    const workspaceDir = resolveAgentWorkspaceDir(ctx.cfg, resolveDefaultAgentId(ctx.cfg));
    const { bootstrapFiles, contextFiles } = await resolveBootstrapContextForRun({
      workspaceDir,
      config: ctx.cfg,
    });
    const analysis = analyzeBootstrapBudget({
      files: buildBootstrapInjectionStats({ bootstrapFiles, injectedFiles: contextFiles }),
      bootstrapMaxChars: resolveBootstrapMaxChars(ctx.cfg),
      bootstrapTotalMaxChars: resolveBootstrapTotalMaxChars(ctx.cfg),
    });

    const findings: HealthFinding[] = [];
    for (const file of analysis.truncatedFiles) {
      findings.push({
        checkId: "core/doctor/bootstrap-size",
        severity: "warning",
        message: `${file.name} exceeds bootstrap limits and will be truncated.`,
        path: file.path,
        fixHint:
          "Reduce the file size or tune agents.defaults.bootstrapMaxChars/TotalMaxChars.",
      });
    }
    for (const file of analysis.nearLimitFiles) {
      if (file.truncated) continue;
      findings.push({
        checkId: "core/doctor/bootstrap-size",
        severity: "info",
        message: `${file.name} is near the configured bootstrap file limit.`,
        path: file.path,
        fixHint: "Reduce the file size or tune agents.defaults.bootstrapMaxChars.",
      });
    }
    if (analysis.totalNearLimit) {
      findings.push({
        checkId: "core/doctor/bootstrap-size",
        severity: analysis.hasTruncation ? "warning" : "info",
        message: "Total bootstrap context is near the configured total limit.",
        path: workspaceDir,
        fixHint:
          "Reduce bootstrap file sizes or tune agents.defaults.bootstrapTotalMaxChars.",
      });
    }
    return findings;
  },
};

const codexSessionRoutesCheck: HealthCheck = {
  id: "core/doctor/codex-session-routes",
  kind: "core",
  description: "Codex runtime routes have a registered Codex plugin harness.",
  source: "doctor",
  async detect(ctx) {
    return collectDisabledCodexPluginRouteIssues(ctx.cfg).map(
      (issue): HealthFinding => ({
        checkId: "core/doctor/codex-session-routes",
        severity: "warning",
        message: `${issue.path} routes ${issue.modelRef} to ${issue.canonicalModel} with Codex runtime, but Codex plugin is disabled.`,
        path: issue.path,
        target: issue.canonicalModel,
        requirement: "Codex plugin enabled for Codex runtime routes.",
        fixHint: issue.blockedOutsideEntry
          ? "Enable plugin loading and remove codex from plugins.deny, or set affected OpenAI models to OpenClaw runtime."
          : "Run `openclaw doctor --fix` to enable plugins.entries.codex, or set affected models to OpenClaw runtime.",
      }),
    );
  },
};

function createSkillsReadinessCheck(
  deps: CoreHealthCheckDeps,
): HealthCheck {
  return {
    id: "core/doctor/skills-readiness",
    kind: "core",
    description: "Allowed skills are usable in the current runtime environment.",
    source: "doctor",
    async detect(ctx) {
      const unavailable = await deps.detectUnavailableSkills(ctx.cfg);
      return unavailable.map(
        (skill): HealthFinding => ({
          checkId: "core/doctor/skills-readiness",
          severity: "warning",
          message: `${skill.name} is allowed but unavailable: ${formatMissingSkillSummary(skill)}.`,
          path: `skills.entries.${skill.skillKey}.enabled`,
          fixHint:
            "Install/configure the missing requirement, or run `openclaw doctor --fix` to disable it.",
        }),
      );
    },
    async repair(ctx) {
      const unavailable = await deps.detectUnavailableSkills(ctx.cfg);
      if (unavailable.length === 0) return { changes: [] };
      const nextConfig = disableUnavailableSkillsInConfig(ctx.cfg, unavailable);
      return {
        config: nextConfig,
        changes: unavailable.map((skill) => `Disabled unavailable skill ${skill.name}.`),
      };
    },
  };
}

const finalConfigValidationCheck: HealthCheck = {
  id: "core/doctor/final-config-validation",
  kind: "core",
  description: "openclaw.jsonc parses and conforms to the config schema.",
  source: "doctor",
  async detect() {
    const { readConfigFileSnapshot } = await import("../config/config.js");
    const snap = await readConfigFileSnapshot({ observe: false });
    if (!snap.exists || snap.valid) return [];
    return configValidationIssuesToHealthFindings(snap.issues);
  },
};

function createSecurityCheck(deps: CoreHealthCheckDeps): HealthCheck {
  return {
    id: "core/doctor/security",
    kind: "core",
    description: "Security posture checks produce structured findings.",
    source: "doctor",
    async detect(ctx) {
      const warnings = await deps.collectSecurityWarnings(ctx.cfg);
      return warnings.map((warning) =>
        noteToFinding(
          "core/doctor/security",
          warning.includes("CRITICAL") ? "error" : "warning",
          warning,
        ),
      );
    },
  };
}

function createWorkspaceSuggestionsCheck(
  deps: CoreHealthCheckDeps,
): HealthCheck {
  return {
    id: "core/doctor/workspace-suggestions",
    kind: "core",
    description: "Workspace backup and memory-system suggestions.",
    source: "doctor",
    async detect(ctx) {
      const workspaceDir = resolveAgentWorkspaceDir(ctx.cfg, resolveDefaultAgentId(ctx.cfg));
      const notes = await deps.collectWorkspaceSuggestions(workspaceDir);
      return notes.map((text) =>
        noteToFinding("core/doctor/workspace-suggestions", "info", text),
      );
    },
  };
}

function createRuntimeToolSchemaCheck(
  deps: CoreHealthCheckDeps,
): HealthCheck {
  return {
    id: "core/doctor/runtime-tool-schemas",
    kind: "core",
    description: "Active agent tool schemas project into model-compatible inputs.",
    source: "doctor",
    async detect(ctx) {
      return deps.collectRuntimeToolSchemaFindings(ctx.cfg);
    },
  };
}

function createProviderCatalogCheck(deps: CoreHealthCheckDeps): HealthCheck {
  return {
    id: "core/doctor/provider-catalog-projection",
    kind: "core",
    description: "Provider catalog hooks project into unified model catalog rows.",
    source: "doctor",
    async detect(ctx) {
      return deps.collectProviderCatalogFindings(ctx.cfg);
    },
  };
}

export function createCoreHealthChecks(
  deps: CoreHealthCheckDeps,
): readonly HealthCheck[] {
  return [
    gatewayConfigCheck,
    claudeCliCheck,
    gatewayAuthCheck,
    codexSessionRoutesCheck,
    commandOwnerCheck,
    createSkillsReadinessCheck(deps),
    finalConfigValidationCheck,
    createSecurityCheck(deps),
    createWorkspaceSuggestionsCheck(deps),
    createRuntimeToolSchemaCheck(deps),
    createProviderCatalogCheck(deps),
    hooksModelCheck,
    bootstrapSizeCheck,
  ];
}