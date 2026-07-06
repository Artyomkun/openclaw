/**
 * Speech Core - TTS
 */

import { spawn } from "node:child_process";

export async function textToSpeech(text: string, options: {
  provider?: "edge" | "google" | "aws";
  voice?: string;
  speed?: number;
} = {}): Promise<Buffer> {
  const provider = options.provider || "edge";
  const voice = options.voice || "en-US-JennyNeural";
  const speed = options.speed || 1.0;
  if (provider === "edge") {
    const args = [
      "--text", text,
      "--voice", voice,
      "--rate", `${(speed - 1) * 100}%`,
      "--write-media", "/dev/stdout",
    ];
    
    const proc = spawn("edge-tts", args);
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      proc.stdout.on("data", chunk => chunks.push(chunk));
      proc.stderr.on("data", data => console.error(data.toString()));
      proc.on("close", code => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`TTS failed with code ${code}`));
      });
    });
  }
  throw new Error(`Provider ${provider} not implemented`);
}

export async function toVoiceNote(audio: Buffer): Promise<Buffer> {
  return audio;
}