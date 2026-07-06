// Proxy capture CA helpers — TLS 1.3 + HTTP/3 (RFC 9114)
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { resolveSystemBin } from "../infra/resolve-system-bin.ts";

const execFileAsync = promisify(execFile);

/**
 * Ensure a short-lived root CA for local MITM debug proxy runs.
 * Uses ECDSA P-256 for TLS 1.3 compatibility (RFC 8446).
 * Existing certs are reused within the cert dir so repeated starts do not prompt regeneration.
 */
export async function ensureDebugProxyCa(certDir: string): Promise<{
  certPath: string;
  keyPath: string;
}> {
  fs.mkdirSync(certDir, { recursive: true });
  const certPath = path.join(certDir, "root-ca.pem");
  const keyPath = path.join(certDir, "root-ca-key.pem");

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { certPath, keyPath };
  }

  const openssl = resolveSystemBin("openssl");
  if (!openssl) {
    throw new Error("openssl is required to generate debug proxy certificates");
  }

  // ECDSA P-256 for TLS 1.3 — faster, smaller, more secure than RSA
  await execFileAsync(openssl, [
    "req",
    "-x509",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:prime256v1",
    "-sha256",
    "-days",
    "7",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-subj",
    "/CN=OpenClaw Debug Proxy (TLS 1.3)",
  ]);

  return { certPath, keyPath };
}