/**
 * @deprecated Broad public SDK barrel. Prefer focused media-store, media-mime,
 * outbound-media, and capability runtime subpaths.
 */

export * from "../media/audio.ts";
export * from "@openclaw/media-core/base64";
export * from "@openclaw/media-core/content-length";
export * from "@openclaw/media-core/constants";
export * from "../media/fetch.ts";
export * from "../media/ffmpeg-limits.ts";
export * from "@openclaw/media-core/inbound-path-policy";
export * from "../media/load-options.ts";
export {
  assertLocalMediaAllowed,
  getDefaultLocalRoots,
  LocalMediaAccessError,
  type LocalMediaAccessErrorCode,
} from "../media/local-media-access.ts";
export * from "../media/local-roots.ts";
export {
  IMAGE_REDUCE_QUALITY_STEPS,
  ImageProcessorUnavailableError,
  MAX_IMAGE_INPUT_PIXELS,
  buildImageResizeSideGrid,
  convertHeicToJpeg,
  getImageMetadata,
  hasAlphaChannel,
  isImageProcessorUnavailableError,
  normalizeExifOrientation,
  optimizeImageToPng,
  parseFfprobeCodecAndSampleRate,
  parseFfprobeCsvFields,
  parseFfprobeVideoDimensions,
  probeVideoDimensions,
  resolveFfmpegBin,
  resizeToJpeg,
  resizeToPng,
  runFfmpeg,
  runFfprobe,
  transcodeAudioBuffer,
  transcodeAudioBufferToOpus,
  type AudioContainerTranscodeOutcome,
  type ImageMetadata,
  type MediaExecOptions,
  type VideoDimensions,
} from "../media/media-services.ts";
export * from "@openclaw/media-core/mime";
export * from "../media/outbound-attachment.ts";
export * from "../media/png-encode.ts";
export * from "../media/qr-image.ts";
export * from "../media/qr-terminal.ts";
export * from "@openclaw/media-core/read-byte-stream-with-limit";
export * from "@openclaw/media-core/read-response-with-limit";
export * from "../media/store.ts";
export * from "../media/temp-files.ts";
export { resolveChannelMediaMaxBytes } from "../channels/plugins/media-limits.ts";
export * from "./agent-media-payload.ts";
export * from "../media-understanding/audio-preflight.ts";
export * from "../media-understanding/defaults.ts";
export * from "../media-understanding/image-runtime.ts";
export * from "../media-understanding/runner.ts";
export { normalizeMediaProviderId } from "../media-understanding/provider-registry.ts";
export * from "../polls.ts";
export {
  createDirectTextMediaOutbound,
  createScopedChannelMediaMaxBytesResolver,
  resolveScopedChannelMediaMaxBytes,
} from "../channels/plugins/outbound/direct-text-media.ts";
