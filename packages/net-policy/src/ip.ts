/**
 * Network Policy - IP Helpers
 */

import ipaddr from "ipaddr.js";

const PRIVATE_IPV4 = new Set([
  "10.0.0.0/8",
  "172.16.0.0/12", 
  "192.168.0.0/16",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "100.64.0.0/10",
  "198.18.0.0/15",
]);

const PRIVATE_IPV6 = new Set([
  "::1/128",
  "fc00::/7",
  "fe80::/10",
  "fec0::/10",
]);

export function isPrivateIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  
  const parsed = ipaddr.parse(ip);
  
  // IPv4
  if (parsed.kind() === "ipv4") {
    const ipv4 = parsed as ipaddr.IPv4;
    for (const cidr of PRIVATE_IPV4) {
      try {
        if (ipv4.match(ipaddr.parseCIDR(cidr))) return true;
      } catch {}
    }
    return false;
  }
  
  // IPv6
  if (parsed.kind() === "ipv6") {
    const ipv6 = parsed as ipaddr.IPv6;
    // IPv4-mapped
    if (ipv6.isIPv4MappedAddress()) {
      return isPrivateIp(ipv6.toIPv4Address().toString());
    }
    for (const cidr of PRIVATE_IPV6) {
      try {
        if (ipv6.match(ipaddr.parseCIDR(cidr))) return true;
      } catch {}
    }
    return false;
  }
  
  return false;
}

export function isLoopbackIp(ip: string): boolean {
  return isPrivateIp(ip) && (
    ip.startsWith("127.") ||
    ip === "::1" ||
    ip === "0:0:0:0:0:0:0:1"
  );
}

export function isCloudMetadataIp(ip: string): boolean {
  return ip === "100.100.100.200" || ip === "fd00:ec2::254";
}