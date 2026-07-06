/**
 * Local Lock - Простая проверка
 */

import net from "node:net";

export function isPortAvailable(port: number): boolean {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}