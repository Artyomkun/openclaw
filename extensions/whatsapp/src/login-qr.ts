/**
 * WhatsApp - Login
 */

import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

export async function loginWhatsApp(authDir: string) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  return sock;
}