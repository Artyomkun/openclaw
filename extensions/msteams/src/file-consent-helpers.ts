/**
 * MSTeams - File Consent Helpers
 */

import { buildFileConsentCard } from "./file-consent.js";

export function prepareFileConsentActivity(params: {
  media: { buffer: Buffer; filename: string; contentType?: string };
  conversationId: string;
  description?: string;
}) {
  const uploadId = storePendingUpload({
    buffer: params.media.buffer,
    filename: params.media.filename,
    contentType: params.media.contentType,
    conversationId: params.conversationId,
  });

  const card = buildFileConsentCard({
    filename: params.media.filename,
    description: params.description || `File: ${params.media.filename}`,
    sizeInBytes: params.media.buffer.length,
    context: { uploadId },
  });

  return {
    activity: { type: "message", attachments: [card] },
    uploadId,
  };
}

export function requiresFileConsent(params: {
  conversationType?: string;
  contentType?: string;
  bufferSize: number;
  thresholdBytes: number;
}): boolean {
  const isPersonal = params.conversationType?.toLowerCase() === "personal";
  const isImage = params.contentType?.startsWith("image/") ?? false;
  return isPersonal && (params.bufferSize >= params.thresholdBytes || !isImage);
}