/**
 * WhatsApp - Login
 */

import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

export async function loginWeb(
  verbose: boolean,
  runtime: any = console,
  accountId?: string
) {
  const { state, saveCreds } = await useMultiFileAuthState(`./auth/${accountId || "default"}`);
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: verbose ? console : undefined,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    if (update.connection === "open") {
      runtime.log("✅ WhatsApp connected!");
    }
  });

  return sock;
}