// Windows console encoding detection and decoding.
import { spawnSync } from "node:child_process";

const WINDOWS_CODEPAGE_ENCODING_MAP: Record<number, string> = {
  65001: "utf-8",
  54936: "gb18030",
  866: "cp866",
  437: "cp437",
  850: "cp850",
  874: "windows-874",
  936: "gbk",
  950: "big5",
  932: "shift_jis",
  949: "euc-kr",
  1250: "windows-1250",
  1251: "windows-1251",
  1252: "windows-1252",
  1253: "windows-1253",
  1254: "windows-1254",
  1255: "windows-1255",
  1256: "windows-1256",
  1257: "windows-1257",
  1258: "windows-1258",
};

let cachedConsoleEncoding: string | null | undefined;
let cachedSystemEncoding: string | null | undefined;

function getCodePage(raw: string): number | null {
  const match = raw.match(/\b(\d{3,5})\b/);
  if (!match) return null;
  const code = Number.parseInt(match[1], 10);
  return code > 0 ? code : null;
}

function getEncoding(platform: NodeJS.Platform, codepage: number | null): string | null {
  if (platform !== "win32" || !codepage) return null;
  return WINDOWS_CODEPAGE_ENCODING_MAP[codepage] ?? null;
}

function getConsoleEncoding(): string | null {
  if (process.platform !== "win32") return null;
  if (cachedConsoleEncoding !== undefined) return cachedConsoleEncoding;

  try {
    const result = spawnSync("chcp", [], { shell: true, encoding: "utf8" });
    const raw = result.stdout + result.stderr;
    const cp = getCodePage(raw);
    cachedConsoleEncoding = getEncoding(process.platform, cp);
  } catch {
    cachedConsoleEncoding = null;
  }
  return cachedConsoleEncoding;
}

function getSystemEncoding(): string | null {
  if (process.platform !== "win32") return null;
  if (cachedSystemEncoding !== undefined) return cachedSystemEncoding;

  try {
    const result = spawnSync("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      "[Text.Encoding]::Default.CodePage"
    ], { encoding: "utf8" });
    const cp = getCodePage(result.stdout);
    cachedSystemEncoding = getEncoding(process.platform, cp);
  } catch {
    cachedSystemEncoding = null;
  }
  return cachedSystemEncoding;
}

export function decodeBuffer(buffer: Buffer, encoding?: string | null): string {
  if (process.platform !== "win32") return buffer.toString("utf-8");

  const enc = encoding ?? getConsoleEncoding();
  if (!enc || enc === "utf-8") return buffer.toString("utf-8");

  try {
    return new TextDecoder(enc).decode(buffer);
  } catch {
    return buffer.toString("utf-8");
  }
}

export function createDecoder(encoding?: string | null) {
  if (process.platform !== "win32") {
    return { decode: (chunk: Buffer) => chunk.toString("utf-8"), flush: () => "" };
  }

  const enc = encoding ?? getConsoleEncoding();
  const isUtf8 = !enc || enc === "utf-8";
  let pending = Buffer.alloc(0);
  let useFallback = false;

  const decoder = isUtf8 ? null : new TextDecoder(enc);

  return {
    decode(chunk: Buffer): string {
      if (isUtf8) return chunk.toString("utf-8");
      if (useFallback) return decoder!.decode(chunk, { stream: true });

      const data = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(data);
      } catch {
        useFallback = true;
        pending = Buffer.alloc(0);
        return decoder!.decode(data, { stream: true });
      }
    },
    flush(): string {
      if (isUtf8) return "";
      if (useFallback) return decoder!.decode();
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(pending);
      } catch {
        return decoder!.decode(pending);
      }
    },
  };
}

// Public API
export function resolveWindowsConsoleEncoding(): string | null {
  return getConsoleEncoding();
}

export function resolveWindowsSystemEncoding(): string | null {
  return getSystemEncoding();
}

export function decodeWindowsOutputBuffer(buffer: Buffer): string {
  return decodeBuffer(buffer, getConsoleEncoding());
}

export function decodeWindowsTextFileBuffer(buffer: Buffer): string {
  return decodeBuffer(buffer, getSystemEncoding());
}

export function createWindowsOutputDecoder(): ReturnType<typeof createDecoder> {
  return createDecoder(getConsoleEncoding());
}