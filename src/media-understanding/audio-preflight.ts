// Audio preflight transcribes voice notes before mention checks and optionally
// echoes the transcript back to the source chat.
import type { MsgContext } from "../auto-reply/templating.ts";
import type { OpenClawConfig } from "../config/types.ts";
import { logVerbose, shouldLogVerbose } from "../globals.ts";
import type { ActiveMediaModel } from "../../packages/media-understanding-common/src/active-model.ts";
import { isAudioAttachment } from "./attachments.ts";
import { runAudioTranscription } from "./audio-transcription-runner.ts";
import { DEFAULT_ECHO_TRANSCRIPT_FORMAT, sendTranscriptEcho } from "./echo-transcript.ts";
import { normalizeMediaAttachments, resolveMediaAttachmentLocalRoots } from "./runner.ts";
import type { MediaUnderstandingProvider } from "./types.ts";

/**
 * Transcribes the first audio attachment BEFORE mention checking.
 * This allows voice notes to be processed in group chats with requireMention: true.
 * Returns the transcript or undefined if transcription fails or no audio is found.
 */
export async function transcribeFirstAudio(params: {
  ctx: MsgContext;
  cfg: OpenClawConfig;
  agentDir?: string;
  providers?: Record<string, MediaUnderstandingProvider>;
  activeModel?: ActiveMediaModel;
}): Promise<string | undefined> {
  const { ctx, cfg } = params;

  const audioConfig = cfg.tools?.media?.audio;
  if (audioConfig?.enabled === false) {
    return undefined;
  }

  const attachments = normalizeMediaAttachments(ctx);
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  const firstAudio = attachments.find(
    (att) => att && isAudioAttachment(att) && !att.alreadyTranscribed,
  );

  if (!firstAudio) {
    return undefined;
  }

  if (shouldLogVerbose()) {
    logVerbose(`audio-preflight: transcribing attachment ${firstAudio.index} for mention check`);
  }

  try {
    const { transcript } = await runAudioTranscription({
      ctx,
      cfg,
      attachments,
      agentDir: params.agentDir,
      providers: params.providers,
      activeModel: params.activeModel,
      localPathRoots: resolveMediaAttachmentLocalRoots({ cfg, ctx }),
    });
    if (!transcript) {
      return undefined;
    }

    if (audioConfig?.echoTranscript) {
      await sendTranscriptEcho({
        ctx,
        cfg,
        transcript,
        format: audioConfig.echoFormat ?? DEFAULT_ECHO_TRANSCRIPT_FORMAT,
      });
    }

    // Mark this attachment as transcribed so the main media pass does not duplicate STT output.
    firstAudio.alreadyTranscribed = true;

    if (shouldLogVerbose()) {
      logVerbose(
        `audio-preflight: transcribed ${transcript.length} chars from attachment ${firstAudio.index}`,
      );
    }

    return transcript;
  } catch (err) {
    // Preflight cannot block message handling; mention checks can still run on text-only input.
    if (shouldLogVerbose()) {
      logVerbose(`audio-preflight: transcription failed: ${String(err)}`);
    }
    return undefined;
  }
}
