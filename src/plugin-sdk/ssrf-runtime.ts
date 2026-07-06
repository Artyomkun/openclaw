// Narrow SSRF helpers for extensions that need pinned-dispatcher and policy
// utilities without loading the full infra-runtime surface.

export { formatErrorMessage } from "../infra/errors.ts";
export { fetchWithSsrFGuard } from "../infra/net/fetch-guard.ts";
export {
  assertHttpUrlTargetsPrivateNetwork,
  buildHostnameAllowlistPolicyFromSuffixAllowlist,
  isPrivateNetworkOptInEnabled,
  mergeSsrFPolicies,
  ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  ssrfPolicyFromPrivateNetworkOptIn,
} from "./ssrf-policy.ts";
export { isPrivateOrLoopbackHost } from "../gateway/net.ts";
