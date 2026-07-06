/**
 * Public SDK subpath for loading and optimizing local or remote web media.
 */
export {
  getDefaultLocalRoots,
  LocalMediaAccessError,
  loadWebMedia,
  loadWebMediaRaw,
  optimizeImageToJpeg,
  optimizeImageToPng,
  type WebMediaResult,
} from "../media/web-media.ts";
export type { LocalMediaAccessErrorCode } from "../media/web-media.ts";
