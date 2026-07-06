/**
 * WhatsApp - QA Driver
 */

import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

export async function startWhatsAppQaDriver(authDir: string) {
  const { state } = await useMultiFileAuthState(authDir);
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  const messages: any[] = [];

  sock.ev.on("messages.upsert", (event) => {
    for (const msg of event.messages || []) {
      messages.push(msg);
    }
  });

  return {
    getMessages: () => messages,
    sendText: async (to: string, text: string) => {
      await sock.sendMessage(to, { text });
    },
    sendMedia: async (to: string, buffer: Buffer, type: string) => {
      await sock.sendMessage(to, { [type]: buffer });
    },
    close: () => sock.end(undefined),
  };
}