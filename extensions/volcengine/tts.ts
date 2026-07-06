// Volcengine plugin module implements tts behavior.
import { fetchWithSsrFGuard } from "openclaw/plugin-sdk/ssrf-runtime";

export type VolcengineTtsEncoding = "ogg_opus" | "mp3" | "pcm" | "wav";

type VolcengineTTSParams = {
  text: string;
  apiKey?: string;
  appId?: string;
  token?: string;
  voice?: string;
  cluster?: string;
  resourceId?: string;
  appKey?: string;
  baseUrl?: string;
  speedRatio?: number;
  volumeRatio?: number;
  pitchRatio?: number;
  emotion?: string;
  encoding?: VolcengineTtsEncoding;
  timeoutMs?: number;
};

const DEFAULT_SEED_VOICE = "en_female_anna_mars_bigtts";
const DEFAULT_SEED_TTS_RESOURCE_ID = "seed-tts-1.0";
const DEFAULT_SEED_TTS_APP_KEY = "aGjiRDfUWi";
const BYTEPLUS_SEED_TTS_URL = "https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/unidirectional";

type VolcengineTtsResponse = {
  code?: number;
  message?: string;
  data?: string;
};

function parseJsonObject(text: string, providerName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${providerName} TTS: failed to parse response JSON: ${detail}`, {
      cause: err,
    });
  }
}

function toTtsResponse(parsed: Record<string, unknown>): VolcengineTtsResponse {
  const header =
    parsed.header && typeof parsed.header === "object" && !Array.isArray(parsed.header)
      ? (parsed.header as Record<string, unknown>)
      : undefined;
  return {
    code:
      typeof parsed.code === "number"
        ? parsed.code
        : typeof header?.code === "number"
          ? header.code
          : undefined,
    message:
      typeof parsed.message === "string"
        ? parsed.message
        : typeof header?.message === "string"
          ? header.message
          : undefined,
    data: typeof parsed.data === "string" ? parsed.data : undefined,
  };
}

function parseSeedTtsFrames(text: string): VolcengineTtsResponse[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  try {
    return [toTtsResponse(parseJsonObject(trimmed, "BytePlus Seed Speech"))];
  } catch {
    // The HTTP API streams JSON frames; Response.text() preserves line breaks.
  }

  const frames: VolcengineTtsResponse[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const item = line.trim();
    if (!item) {
      continue;
    }
    const json = item.startsWith("data:") ? item.slice("data:".length).trim() : item;
    frames.push(toTtsResponse(parseJsonObject(json, "BytePlus Seed Speech")));
  }
  return frames;
}

function hostnameAllowlist(url: string): string[] {
  return [new URL(url).hostname];
}

function seedAudioFormat(encoding: VolcengineTtsEncoding): "ogg_opus" | "mp3" | "pcm" {
  return encoding === "wav" ? "pcm" : encoding;
}

async function seedSpeechTTS(params: VolcengineTTSParams & { apiKey: string }): Promise<Buffer> {
  const {
    text,
    apiKey,
    voice = DEFAULT_SEED_VOICE,
    resourceId = DEFAULT_SEED_TTS_RESOURCE_ID,
    appKey = DEFAULT_SEED_TTS_APP_KEY,
    baseUrl = BYTEPLUS_SEED_TTS_URL,
    speedRatio = 1,
    emotion,
    encoding = "ogg_opus",
    timeoutMs = 30_000,
  } = params;
  const audioFormat = seedAudioFormat(encoding);

  const payload = JSON.stringify({
    user: { uid: "openclaw" },
    req_params: {
      text,
      speaker: voice,
      audio_params: {
        format: audioFormat,
        sample_rate: 24_000,
      },
      ...(speedRatio !== 1 ? { speed_ratio: speedRatio } : {}),
      ...(emotion ? { emotion } : {}),
    },
  });

  const { response, release } = await fetchWithSsrFGuard({
    url: baseUrl,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Connection: "keep-alive",
        "X-Api-Key": apiKey,
        "X-Api-Resource-Id": resourceId,
        "X-Api-App-Key": appKey,
      },
      body: payload,
    },
    timeoutMs,
    policy: { hostnameAllowlist: hostnameAllowlist(baseUrl) },
    auditContext: "volcengine.tts",
  });
}

export async function volcengineTTS(params: VolcengineTTSParams): Promise<Buffer> {
  if (params.apiKey) {
    return seedSpeechTTS({ ...params, apiKey: params.apiKey });
  }
  throw new Error(
    "Volcengine TTS credentials missing. Set a BytePlus Seed Speech API key or old AppID/token.",
  );
}
