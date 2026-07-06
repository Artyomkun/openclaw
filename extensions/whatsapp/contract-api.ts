// Whatsapp API module exposes the plugin public contract.
import { whatsappCommandPolicy as whatsappCommandPolicyImpl } from "./src/command-policy.js";
import { testing as whatsappAccessControlTestingImpl } from "./src/inbound/access-control.js";
import {
  isWhatsAppGroupJid as isWhatsAppGroupJidImpl,
  normalizeWhatsAppTarget as normalizeWhatsAppTargetImpl,
} from "./src/normalize-target.js";

export const isWhatsAppGroupJid = isWhatsAppGroupJidImpl;
export const normalizeWhatsAppTarget = normalizeWhatsAppTargetImpl;
export const whatsappAccessControlTesting = whatsappAccessControlTestingImpl;
export const whatsappCommandPolicy = whatsappCommandPolicyImpl;
