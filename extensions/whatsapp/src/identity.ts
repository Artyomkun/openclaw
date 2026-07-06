/**
 * WhatsApp - Identity
 */

export function getSender(msg: any) {
  return msg.platform.sender || {
    jid: msg.platform.senderJid,
    e164: msg.platform.senderE164,
    name: msg.platform.senderName,
  };
}