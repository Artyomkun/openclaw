// Secrets audit — simplified
import fs from "node:fs";
import path from "node:path";
import { type OpenClawConfig } from "../config/config.ts";
import { resolveUserPath } from "../utils.ts";

export type SecretsAuditCode =
  | "PLAINTEXT_FOUND"
  | "REF_UNRESOLVED"
  | "REF_SHADOWED";

export type SecretsAuditSeverity = "info" | "warn" | "error";

export type SecretsAuditFinding = {
  code: SecretsAuditCode;
  severity: SecretsAuditSeverity;
  file: string;
  jsonPath: string;
  message: string;
  provider?: string;
};

export type SecretsAuditReport = {
  status: "clean" | "findings" | "unresolved";
  summary: {
    plaintextCount: number;
    unresolvedRefCount: number;
    shadowedRefCount: number;
  };
  findings: SecretsAuditFinding[];
};

function isSecretRef(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    ("env" in value || "file" in value || "exec" in value)
  );
}

function isPlaintextSecret(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("$")) return false;
  if (value.startsWith("{{")) return false;
  if (value.startsWith("env:")) return false;
  return true;
}

export async function runSecretsAudit(
  config: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SecretsAuditReport> {
  const findings: SecretsAuditFinding[] = [];
  const providers = config.models?.providers ?? {};
  for (const [providerId, providerConfig] of Object.entries(providers)) {
    const configObj = providerConfig as Record<string, unknown>;
    if (configObj.apiKey) {
      if (isSecretRef(configObj.apiKey)) {
        const ref = configObj.apiKey as Record<string, unknown>;
        let resolved = false;
        
        if (ref.env && typeof ref.env === "string") {
          const envValue = env[ref.env];
          if (envValue && envValue.length > 0) {
            resolved = true;
          } else {
            findings.push({
              code: "REF_UNRESOLVED",
              severity: "error",
              file: "config",
              jsonPath: `models.providers.${providerId}.apiKey`,
              message: `Secret ref ${ref.env} not found in environment`,
              provider: providerId,
            });
          }
        } else if (ref.file && typeof ref.file === "string") {
          try {
            const filePath = resolveUserPath(ref.file);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, "utf-8").trim();
              if (content.length > 0) {
                resolved = true;
              }
            }
          } catch {
            findings.push({
              code: "REF_UNRESOLVED",
              severity: "error",
              file: "config",
              jsonPath: `models.providers.${providerId}.apiKey`,
              message: `Secret ref file ${ref.file} not found or empty`,
              provider: providerId,
            });
          }
        } else if (ref.exec && typeof ref.exec === "string") {
          findings.push({
            code: "REF_UNRESOLVED",
            severity: "info",
            file: "config",
            jsonPath: `models.providers.${providerId}.apiKey`,
            message: `Exec ref ${ref.exec} requires runtime resolution (skipped during audit)`,
            provider: providerId,
          });
        }
        
        if (!resolved) {
          findings.push({
            code: "REF_UNRESOLVED",
            severity: "error",
            file: "config",
            jsonPath: `models.providers.${providerId}.apiKey`,
            message: `Secret ref could not be resolved for ${providerId}`,
            provider: providerId,
          });
        }
      } else if (isPlaintextSecret(configObj.apiKey)) {
        findings.push({
          code: "PLAINTEXT_FOUND",
          severity: "warn",
          file: "config",
          jsonPath: `models.providers.${providerId}.apiKey`,
          message: `Plaintext API key for ${providerId}`,
          provider: providerId,
        });
      }
    }
    const headers = configObj.headers as Record<string, string> | undefined;
    if (headers) {
      for (const [headerKey, headerValue] of Object.entries(headers)) {
        if (
          headerKey.toLowerCase().includes("authorization") ||
          headerKey.toLowerCase().includes("api-key") ||
          headerKey.toLowerCase().includes("token")
        ) {
          if (isPlaintextSecret(headerValue)) {
            findings.push({
              code: "PLAINTEXT_FOUND",
              severity: "warn",
              file: "config",
              jsonPath: `models.providers.${providerId}.headers.${headerKey}`,
              message: `Plaintext header value for ${providerId}`,
              provider: providerId,
            });
          }
        }
      }
    }
  }
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match) {
        const key = match[1];
        const value = match[2];
        if (
          key.includes("API_KEY") ||
          key.includes("TOKEN") ||
          key.includes("SECRET")
        ) {
          if (value && !value.startsWith("$") && !value.startsWith("{{") && !value.startsWith("env:")) {
            findings.push({
              code: "PLAINTEXT_FOUND",
              severity: "warn",
              file: envPath,
              jsonPath: `env.${key}`,
              message: `Plaintext secret found in .env (${key})`,
            });
          }
        }
      }
    }
  }
  const plaintextCount = findings.filter(f => f.code === "PLAINTEXT_FOUND").length;
  const unresolvedRefCount = findings.filter(f => f.code === "REF_UNRESOLVED").length;
  const shadowedRefCount = findings.filter(f => f.code === "REF_SHADOWED").length;

  const status: SecretsAuditReport["status"] =
    unresolvedRefCount > 0 ? "unresolved" :
    findings.length > 0 ? "findings" :
    "clean";

  return {
    status,
    summary: {
      plaintextCount,
      unresolvedRefCount,
      shadowedRefCount,
    },
    findings,
  };
}

export function resolveSecretsAuditExitCode(report: SecretsAuditReport, check: boolean): number {
  if (report.summary.unresolvedRefCount > 0) return 2;
  if (check && report.findings.length > 0) return 1;
  return 0;
}