/**
 * Memory Core - Oracle QMD Session Artifacts
 */

import type { Connection } from "oracledb";

export type QmdSessionArtifactMapping = {
  collection: string;
  artifactPath: string;
  searchPath: string;
  memoryKey: string;
  agentId: string;
  sessionId: string;
  archived?: boolean;
};

export type QmdSessionArtifactIdentity = {
  agentId: string;
  archived: boolean;
  memoryKey: string;
  sessionId: string;
};

const TABLE = "openclaw_qmd_session_artifacts";

export async function replaceQmdSessionArtifactMappings(params: {
  collection: string;
  db: Connection;
  mappings: QmdSessionArtifactMapping[];
}): Promise<void> {
  const updatedAt = Date.now();

  try {
    await params.db.execute('BEGIN');

    await params.db.execute(
      `DELETE FROM ${TABLE} WHERE collection = :collection`,
      { collection: params.collection }
    );

    for (const m of params.mappings) {
      await params.db.execute(`
        INSERT INTO ${TABLE} 
        (collection, artifact_path, search_path, memory_key, agent_id, session_id, archived, updated_at)
        VALUES (:collection, :artifactPath, :searchPath, :memoryKey, :agentId, :sessionId, :archived, :updatedAt)
      `, {
        collection: m.collection,
        artifactPath: m.artifactPath,
        searchPath: m.searchPath,
        memoryKey: m.memoryKey,
        agentId: m.agentId,
        sessionId: m.sessionId,
        archived: m.archived ? 1 : 0,
        updatedAt,
      });
    }

    await params.db.execute('COMMIT');
  } catch (error) {
    await params.db.execute('ROLLBACK');
    throw error;
  }
}

export async function resolveQmdSessionArtifactIdentity(params: {
  db: Connection;
  searchPath: string;
  collection?: string;
  artifactPath?: string;
}): Promise<QmdSessionArtifactIdentity | null> {
  try {
    const result = await params.db.execute(`
      SELECT agent_id, archived, memory_key, session_id
      FROM ${TABLE}
      WHERE search_path = :searchPath
         OR (collection = :collection AND artifact_path = :artifactPath)
      FETCH FIRST 1 ROWS ONLY
    `, {
      searchPath: params.searchPath,
      collection: params.collection ?? "",
      artifactPath: params.artifactPath ?? "",
    });

    const row = result.rows?.[0];
    if (!row) return null;

    return {
      agentId: row[0],
      archived: row[1] === 1,
      memoryKey: row[2],
      sessionId: row[3],
    };
  } catch {
    return null;
  }
}