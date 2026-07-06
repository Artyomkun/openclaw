import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const SsrFPolicySchema = z.object({
  allowPrivateNetwork: z.boolean().optional(),
  dangerouslyAllowPrivateNetwork: z.boolean().optional(),
  allowRfc2544BenchmarkRange: z.boolean().optional(),
  allowIpv6UniqueLocalRange: z.boolean().optional(),
  allowedHostnames: z.array(z.string()).optional(),
  allowedOrigins: z.array(z.string()).optional(),
  hostnameAllowlist: z.array(z.string()).optional(),
});

type SsrFPolicy = z.infer<typeof SsrFPolicySchema>;

// ============================================
// MAIN
// ============================================

export function isBlockedHostname(hostname: string, policy?: SsrFPolicy): boolean {
  const normalized = hostname.toLowerCase().trim();
  if (!normalized) return true;
  const blocked = new Set([
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "127.0.0.1",
    "::1",
  ]);
  
  if (blocked.has(normalized)) return true;
  if (normalized.endsWith(".localhost")) return true;
  if (normalized.endsWith(".local")) return true;
  if (normalized.endsWith(".internal")) return true;
  if (isPrivateIp(normalized)) {
    if (policy?.allowPrivateNetwork || policy?.dangerouslyAllowPrivateNetwork) {
      return false;
    }
    return true;
  }
  if (policy?.hostnameAllowlist?.length) {
    return !policy.hostnameAllowlist.some(pattern => 
      hostname === pattern || 
      (pattern.startsWith("*.") && hostname.endsWith(pattern.slice(1)))
    );
  }
  
  return false;
}

function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  const ipv4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [_, a, b] = ipv4.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    return false;
  }
  
  // IPv6 private
  if (ip.includes(":")) {
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    if (ip.startsWith("fe80")) return true;
    if (ip.startsWith("::1")) return true;
    return false;
  }
  
  return false;
}

export function assertPublicHostname(hostname: string): void {
  if (isBlockedHostname(hostname)) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }
}