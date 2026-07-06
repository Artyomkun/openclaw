/**
 * MSTeams - File Consent
 * 
 * Простая загрузка больших файлов в Teams.
 */

export function buildFileConsentCard(params: {
  filename: string;
  sizeInBytes: number;
  description?: string;
  context?: Record<string, string>;
}) {
  return {
    contentType: "application/vnd.microsoft.teams.card.file.consent",
    name: params.filename,
    content: {
      description: params.description || `File: ${params.filename}`,
      sizeInBytes: params.sizeInBytes,
      acceptContext: { filename: params.filename, ...params.context },
      declineContext: { filename: params.filename, ...params.context },
    },
  };
}

export function buildFileInfoCard(params: {
  filename: string;
  contentUrl: string;
  uniqueId: string;
  fileType: string;
}) {
  return {
    contentType: "application/vnd.microsoft.teams.card.file.info",
    contentUrl: params.contentUrl,
    name: params.filename,
    content: {
      uniqueId: params.uniqueId,
      fileType: params.fileType,
    },
  };
}

export function parseFileConsentInvoke(activity: { name?: string; value?: string }) {
  if (activity.name !== "fileConsent/invoke") return null;
  
  const value = activity.value as any;
  if (value?.type !== "fileUpload") return null;
  
  return {
    action: value.action === "accept" ? "accept" : "decline",
    uploadInfo: value.uploadInfo,
    context: value.context,
  };
}

export async function uploadToConsentUrl(params: {
  url: string;
  buffer: Buffer;
  contentType?: string;
}) {
  const url = new URL(params.url);
  if (url.protocol !== "https:") {
    throw new Error("URL must use HTTPS");
  }
  
  const response = await fetch(params.url, {
    method: "PUT",
    headers: {
      "User-Agent": "OpenClaw",
      "Content-Type": params.contentType || "application/octet-stream",
      "Content-Range": `bytes 0-${params.buffer.length - 1}/${params.buffer.length}`,
    },
    body: params.buffer,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }
}