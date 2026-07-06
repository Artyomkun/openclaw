// Public attachment facade for normalization, selection, and local media caching helpers.
export {
  isAudioAttachment,
  normalizeAttachments,
  resolveAttachmentKind,
} from "./attachments.normalize.ts";
export { selectAttachments } from "./attachments.select.ts";
export { MediaAttachmentCache, type MediaAttachmentCacheOptions } from "./attachments.cache.ts";
