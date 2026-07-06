// Proxy capture server — Oracle + HTTP/3 (RFC 9114)
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request } from "undici"; // HTTP/3 via undici
import net from "node:net";
import { URL } from "node:url";
import { ensureDebugProxyCa } from "./ca.ts";
import type { DebugProxySettings } from "./env.ts";
import { getDebugProxyCaptureStore } from "./store.oracle.ts";
import type { CaptureEventRecord } from "./types.ts";

const TRUTHY_ENV = new Set(["1", "true", "yes", "on"]);
const CAPTURE_BODY_PREVIEW_BYTES = 8192;

type BodyPreviewCapture = {
  chunks: Buffer[];
  previewBytes: number;
  totalBytes: number;
  truncated: boolean;
};

function isTruthyEnvValue(value: string | undefined): boolean {
  return TRUTHY_ENV.has((value ?? "").trim().toLowerCase());
}

type DebugProxyServerHandle = {
  proxyUrl: string;
  stop: () => Promise<void>;
};

type ProxyCaptureEventInput = Omit<
  CaptureEventRecord,
  "sessionId" | "ts" | "sourceScope" | "sourceProcess"
>;

function createProxyCaptureRecorder(params: {
  store: ReturnType<typeof getDebugProxyCaptureStore>;
  settings: DebugProxySettings;
}) {
  return (event: ProxyCaptureEventInput): void => {
    params.store.recordEvent({
      sessionId: params.settings.sessionId,
      ts: Date.now(),
      sourceScope: "openclaw",
      sourceProcess: params.settings.sourceProcess,
      ...event,
    });
  };
}

export function parseConnectTarget(rawTarget: string | undefined): {
  hostname: string;
  port: number;
} {
  const trimmed = rawTarget?.trim() ?? "";
  if (!trimmed) {
    return { hostname: "127.0.0.1", port: 443 };
  }

  const bracketedMatch = trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketedMatch) {
    const hostname = bracketedMatch[1]?.trim() || "127.0.0.1";
    const port = Number(bracketedMatch[2] || 443);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Invalid CONNECT target port");
    }
    return { hostname, port };
  }

  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon <= 0 || lastColon === trimmed.length - 1) {
    return { hostname: trimmed, port: 443 };
  }
  const hostname = trimmed.slice(0, lastColon).trim() || "127.0.0.1";
  const portText = trimmed.slice(lastColon + 1).trim();
  if (!/^\d+$/.test(portText)) {
    throw new Error("Invalid CONNECT target port");
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid CONNECT target port");
  }
  return { hostname, port };
}

function normalizeTargetUrl(req: IncomingMessage): URL {
  if (req.url?.startsWith("http://") || req.url?.startsWith("https://")) {
    return new URL(req.url);
  }
  const host = req.headers.host ?? "127.0.0.1";
  return new URL(`http://${host}${req.url ?? "/"}`);
}

function createBodyPreviewCapture(): BodyPreviewCapture {
  return { chunks: [], previewBytes: 0, totalBytes: 0, truncated: false };
}

function appendBodyPreviewCapture(capture: BodyPreviewCapture, chunk: Buffer | string): void {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  capture.totalBytes += buffer.byteLength;
  const remaining = CAPTURE_BODY_PREVIEW_BYTES - capture.previewBytes;
  if (remaining <= 0) {
    capture.truncated = capture.truncated || buffer.byteLength > 0;
    return;
  }
  const slice = buffer.byteLength > remaining ? buffer.subarray(0, remaining) : buffer;
  capture.chunks.push(slice);
  capture.previewBytes += slice.byteLength;
  if (slice.byteLength < buffer.byteLength) {
    capture.truncated = true;
  }
}

function finishBodyPreviewCapture(capture: BodyPreviewCapture): {
  dataText: string;
  metaJson: string;
} {
  return {
    dataText: Buffer.concat(capture.chunks, capture.previewBytes).toString("utf8"),
    metaJson: JSON.stringify({
      bodyBytes: capture.totalBytes,
      capturePreviewBytes: CAPTURE_BODY_PREVIEW_BYTES,
      captureTruncated: capture.truncated,
    }),
  };
}

export async function startDebugProxyServer(params: {
  host?: string;
  port?: number;
  settings: DebugProxySettings;
}): Promise<DebugProxyServerHandle> {
  await ensureDebugProxyCa(params.settings.certDir);
  const store = getDebugProxyCaptureStore();
  const recordProxyEvent = createProxyCaptureRecorder({ store, settings: params.settings });
  const host = params.host?.trim() || "127.0.0.1";

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const flowId = randomUUID();
      let target: URL;
      try {
        target = normalizeTargetUrl(req);
      } catch (error) {
        const message = "Invalid proxy target URL";
        recordProxyEvent({
          protocol: "http",
          direction: "local",
          kind: "error",
          flowId,
          method: req.method,
          host: req.headers.host,
          path: req.url ?? "",
          errorText: error instanceof Error ? error.message : String(error),
        });
        const responseBody = `${message}\n`;
        res.writeHead(400, {
          Connection: "close",
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": Buffer.byteLength(responseBody),
        });
        res.end(responseBody);
        return;
      }
      const targetProtocol = target.protocol === "https:" ? "https" : "http";
      const targetPath = `${target.pathname}${target.search}`;
      const recordTargetEvent = (
        event: Omit<ProxyCaptureEventInput, "protocol" | "flowId" | "method" | "host" | "path">,
      ) =>
        recordProxyEvent({
          protocol: targetProtocol,
          flowId,
          method: req.method,
          host: target.host,
          path: targetPath,
          ...event,
        });

      const requestCapture = createBodyPreviewCapture();
      
      // HTTP/3 via undici — RFC 9114
      try {
        const upstreamRes = await request(target.toString(), {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req,
          alpnProtocols: ['h3', 'h2', 'http/1.1'],
        });

        const responseCapture = createBodyPreviewCapture();
        
        const chunks: Buffer[] = [];
        for await (const chunk of upstreamRes.body) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          appendBodyPreviewCapture(responseCapture, buffer);
          chunks.push(buffer);
        }

        const headers = upstreamRes.headers as Record<string, string>;
        res.writeHead(upstreamRes.statusCode, headers);
        
        for (const chunk of chunks) {
          res.write(chunk);
        }
        res.end();

        recordTargetEvent({
          direction: "inbound",
          kind: "response",
          status: upstreamRes.statusCode,
          headersJson: JSON.stringify(headers),
          ...finishBodyPreviewCapture(responseCapture),
        });

        recordTargetEvent({
          direction: "outbound",
          kind: "request",
          headersJson: JSON.stringify(req.headers),
          ...finishBodyPreviewCapture(requestCapture),
        });

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        recordTargetEvent({
          direction: "local",
          kind: "error",
          errorText: err.message,
        });
        res.statusCode = 502;
        res.end(err.message);
      }
    })();
  });

  server.on("connect", (req, clientSocket, head) => {
    const flowId = randomUUID();
    let hostname = "127.0.0.1";
    let port: number;
    
    try {
      const parsed = parseConnectTarget(req.url);
      hostname = parsed.hostname;
      port = parsed.port;
    } catch (error) {
      recordProxyEvent({
        protocol: "connect",
        direction: "local",
        kind: "error",
        flowId,
        host: hostname,
        path: req.url ?? "",
        errorText: error instanceof Error ? error.message : String(error),
      });
      clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }

    recordProxyEvent({
      protocol: "connect",
      direction: "local",
      kind: "connect",
      flowId,
      host: hostname,
      path: req.url ?? "",
      headersJson: JSON.stringify(req.headers),
    });

    const upstreamSocket = net.connect(port, hostname, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) {
        upstreamSocket.write(head);
      }
      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
    });

    clientSocket.on("error", (error) => {
      recordProxyEvent({
        protocol: "connect",
        direction: "local",
        kind: "error",
        flowId,
        host: hostname,
        path: req.url ?? "",
        errorText: error.message,
      });
      upstreamSocket.destroy();
    });

    upstreamSocket.on("error", (error) => {
      recordProxyEvent({
        protocol: "connect",
        direction: "local",
        kind: "error",
        flowId,
        host: hostname,
        path: req.url ?? "",
        errorText: error.message,
      });
      clientSocket.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(params.port ?? 0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve debug proxy server address");
  }
  
  return {
    proxyUrl: `http://${host}:${address.port}`,
    stop: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}