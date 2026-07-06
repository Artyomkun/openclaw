/** Runtime media-understanding dependencies used by ACP reply dispatch. */
export { applyMediaUnderstanding } from "../../media-understanding/apply.ts";
export { MediaAttachmentCache } from "../../media-understanding/attachments.ts";
export { normalizeAttachments } from "../../media-understanding/attachments.normalize.ts";
export { isMediaUnderstandingSkipError } from "../../../packages/media-understanding-common/src/errors.ts";
export { resolveMediaAttachmentLocalRoots } from "../../media-understanding/runner.ts";
