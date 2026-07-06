// Elevenlabs helper module supports config compat behavior.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ELEVENLABS_API_KEY_ENV = "ELEVENLABS_API_KEY";
const PROFILE_CANDIDATES = [".profile", ".zprofile", ".zshrc", ".bashrc"] as const;

type ElevenLabsApiKeyDeps = {
  fs?: typeof fs;
  os?: typeof os;
  path?: typeof path;
};

export const ELEVENLABS_TALK_PROVIDER_ID = "elevenlabs";

function readApiKeyFromProfile(): string | null {
  const home = os.homedir();
  for (const candidate of PROFILE_CANDIDATES) {
    const fullPath = path.join(home, candidate);
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const match = text.match(
        /(?:^|\n)\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^\n"']+)["']?/
      );
      const value = match?.[1]?.trim();
      if (value) {
        return value;
      }
    } catch (err) {
      console.warn(`Failed to read ${fullPath}:`, err);
    }
  }
  return null;
}

export function resolveElevenLabsApiKeyWithProfileFallback(
  env: NodeJS.ProcessEnv = process.env,
  deps: ElevenLabsApiKeyDeps = {},
): string | null {
  const envValue = (env[ELEVENLABS_API_KEY_ENV] ?? "").trim();
  if (envValue) {
    return envValue;
  }
  return readApiKeyFromProfile(deps);
}
