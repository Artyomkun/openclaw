// Proxy capture path helpers — Oracle + HTTP/3
import path from "node:path";
import { resolveStateDir } from "../config/paths.ts";

// Debug proxy CA files live under OpenClaw state.
// Capture data lives in Oracle Database — no local files needed.
function resolveDebugProxyRootDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "debug-proxy");
}

export function resolveDebugProxyCertDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveDebugProxyRootDir(env), "certs");
}