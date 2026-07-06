/**
 * WhatsApp - Inbound Message Normalization
 * 
 * Простая нормализация входящих сообщений.
 */

import { buildDeprecatedFlatWhatsAppInboundAdmission } from "./admission.js";

export function normalizeWebInboundMessage(msg: any): any {
  if (msg.event && msg.payload && msg.platform) {
    return msg;
  }
  return {
    ...msg,
    admission: msg.admission || buildDeprecatedFlatWhatsAppInboundAdmission(msg),
    event: {
      id: msg.id,
      timestamp: msg.timestamp,
      isBatched: msg.isBatched,
    },
    payload: {
      body: msg.body,
      media: msg.mediaPath || msg.mediaType || msg.mediaFileName || msg.mediaUrl ? {
        path: msg.mediaPath,
        type: msg.mediaType,
        fileName: msg.mediaFileName,
        url: msg.mediaUrl,
      } : undefined,
      location: msg.location,
      untrustedStructuredContext: msg.untrustedStructuredContext,
    },
    platform: {
      chatJid: msg.chatId,
      recipientJid: msg.to,
      sender: msg.sender,
      senderJid: msg.senderJid,
      senderE164: msg.senderE164,
      senderName: msg.senderName,
      pushName: msg.pushName,
      self: msg.self,
      selfJid: msg.selfJid,
      selfLid: msg.selfLid,
      selfE164: msg.selfE164,
      fromMe: msg.fromMe,
    },
    quote: msg.replyTo ? {
      id: msg.replyTo.id,
      body: msg.replyTo.body,
      sender: msg.replyTo.sender,
    } : undefined,
    group: msg.groupSubject || msg.groupParticipants || msg.mentions ? {
      subject: msg.groupSubject,
      participants: msg.groupParticipants,
      mentions: msg.mentions ? { jids: msg.mentions } : undefined,
    } : undefined,
  };
}