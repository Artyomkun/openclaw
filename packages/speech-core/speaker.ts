/**
 * Speaker Selection - Compatibility Helpers
 */

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function withSpeakerSelectionCompat(config: any = {}): any {
  const next = { ...config };
  
  const voice = readString(next.speakerVoice) || readString(next.voice) || readString(next.voiceName);
  const voiceId = readString(next.speakerVoiceId) || readString(next.voiceId);
  
  if (voice) {
    next.speakerVoice = voice;
    next.voice = voice;
    next.voiceName = voice;
  }
  if (voiceId) {
    next.speakerVoiceId = voiceId;
    next.voiceId = voiceId;
  }
  
  return next;
}