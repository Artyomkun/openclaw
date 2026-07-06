/**
 * MSTeams - Graph Chat
 */

export function formatTeamsFile(file: { eTag: string; webDavUrl: string; name: string }) {
  return {
    type: "file",
    url: file.webDavUrl,
    name: file.name,
    id: file.eTag.replace(/["{}]/g, "").split(",")[0] || file.eTag,
    ext: file.name.split(".").pop()?.toLowerCase() || "unknown",
  };
}