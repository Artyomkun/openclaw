// Compaction session-file rotation shares the same owner as session path resolution.
import path from "node:path";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.ts";
import { resolveSessionFilePath, resolveSessionFilePathOptions } from "./paths.ts";
import {
  canonicalizeAbsoluteSessionFilePath,
  rewriteSessionFileForNewSessionId,
} from "./session-file-rotation.ts";
import type { SessionEntry } from "./types.ts";

export function resolveCompactionSessionFile(params: {
  entry: SessionEntry;
  sessionKey: string;
  storePath?: string;
  newSessionId: string;
}): string {
  const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
  const pathOpts = resolveSessionFilePathOptions({
    agentId,
    storePath: params.storePath,
  });
  const rewrittenSessionFile = rewriteSessionFileForNewSessionId({
    sessionFile: params.entry.sessionFile,
    previousSessionId: params.entry.sessionId,
    nextSessionId: params.newSessionId,
  });
  const normalizedRewrittenSessionFile =
    rewrittenSessionFile && path.isAbsolute(rewrittenSessionFile)
      ? canonicalizeAbsoluteSessionFilePath(rewrittenSessionFile)
      : rewrittenSessionFile;
  return resolveSessionFilePath(
    params.newSessionId,
    normalizedRewrittenSessionFile ? { sessionFile: normalizedRewrittenSessionFile } : undefined,
    pathOpts,
  );
}
