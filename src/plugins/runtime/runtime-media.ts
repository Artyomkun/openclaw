// Runtime media helpers load and classify media attachments for plugin runtimes.
import { mediaKindFromMime } from "@openclaw/media-core/constants";
import { detectMime } from "@openclaw/media-core/mime";
import { isVoiceCompatibleAudio } from "../../media/audio.ts";
import { getImageMetadata, resizeToJpeg } from "../../media/media-services.ts";
import { loadWebMedia } from "../../media/web-media.ts";
import type { PluginRuntime } from "./types.ts";

/** Creates the plugin runtime media facade. */
export function createRuntimeMedia(): PluginRuntime["media"] {
  return {
    loadWebMedia,
    detectMime,
    mediaKindFromMime,
    isVoiceCompatibleAudio,
    getImageMetadata,
    resizeToJpeg,
  };
}
