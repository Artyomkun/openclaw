// Shared bootstrap/pairing helpers for plugins that provision remote devices.

export { approveDevicePairing, listDevicePairing } from "../infra/device-pairing.ts";
export {
  clearDeviceBootstrapTokens,
  issueDeviceBootstrapToken,
  revokeDeviceBootstrapToken,
} from "../infra/device-bootstrap.ts";
export {
  normalizeDeviceBootstrapProfile,
  PAIRING_SETUP_BOOTSTRAP_PROFILE,
  type DeviceBootstrapProfile,
  type DeviceBootstrapProfileInput,
} from "../shared/device-bootstrap-profile.ts";
