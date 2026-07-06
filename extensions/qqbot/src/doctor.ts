// Qqbot plugin module implements doctor behavior.
import type { ChannelDoctorAdapter } from "openclaw/plugin-sdk/channel-contract";
import { normalizeCompatibilityConfig } from "./doctor-contract.js";

export const qqbotDoctor: ChannelDoctorAdapter = { normalizeCompatibilityConfig };
