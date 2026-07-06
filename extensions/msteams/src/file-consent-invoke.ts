/**
 * MSTeams - File Consent
 */

type PendingFile = {
  id: string;
  buffer: Buffer;
  filename: string;
  contentType?: string;
  conversationId: string;
  consentCardActivityId?: string;
  createdAt: number;
};

const TABLE = "msteams_pending_uploads";

async function ensureTable(pool: any): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE TABLE ${TABLE} (
            id VARCHAR2(64) PRIMARY KEY,
            buffer BLOB NOT NULL,
            filename VARCHAR2(500) NOT NULL,
            content_type VARCHAR2(200),
            conversation_id VARCHAR2(500) NOT NULL,
            consent_card_activity_id VARCHAR2(500),
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP
          )
        ';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE INDEX idx_msteams_uploads_conv ON ${TABLE}(conversation_id)
        ';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function savePendingUpload(params: {
  pool: any;
  id: string;
  buffer: Buffer;
  filename: string;
  contentType?: string;
  conversationId: string;
  consentCardActivityId?: string;
}): Promise<void> {
  await ensureTable(params.pool);
  const conn = await params.pool.getConnection();
  try {
    await conn.execute(
      `MERGE INTO ${TABLE} target
       USING (SELECT :id AS id FROM DUAL) source
       ON (target.id = source.id)
       WHEN MATCHED THEN
         UPDATE SET 
           buffer = :buffer,
           filename = :filename,
           content_type = :contentType,
           conversation_id = :conversationId,
           consent_card_activity_id = :consentCardActivityId,
           created_at = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (id, buffer, filename, content_type, conversation_id, consent_card_activity_id)
         VALUES (:id, :buffer, :filename, :contentType, :conversationId, :consentCardActivityId)`,
      {
        id: params.id,
        buffer: params.buffer,
        filename: params.filename,
        contentType: params.contentType || null,
        conversationId: params.conversationId,
        consentCardActivityId: params.consentCardActivityId || null,
      }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function getPendingUpload(params: {
  pool: any;
  id: string;
}): Promise<PendingFile | null> {
  await ensureTable(params.pool);
  const conn = await params.pool.getConnection();
  try {
    const result = await conn.execute(
      `SELECT id, buffer, filename, content_type, conversation_id, consent_card_activity_id
       FROM ${TABLE}
       WHERE id = :id`,
      { id: params.id }
    );
    
    if (!result.rows?.length) return null;
    const row = result.rows[0];
    
    return {
      id: row[0],
      buffer: row[1],
      filename: row[2],
      contentType: row[3],
      conversationId: row[4],
      consentCardActivityId: row[5],
      createdAt: Date.now(),
    };
  } finally {
    await conn.close();
  }
}

export async function removePendingUpload(params: {
  pool: any;
  id: string;
}): Promise<void> {
  await ensureTable(params.pool);
  const conn = await params.pool.getConnection();
  try {
    await conn.execute(
      `DELETE FROM ${TABLE} WHERE id = :id`,
      { id: params.id }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function cleanupOldUploads(params: {
  pool: any;
  olderThanMs?: number;
}): Promise<number> {
  await ensureTable(params.pool);
  const olderThan = params.olderThanMs || 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - olderThan);
  
  const conn = await params.pool.getConnection();
  try {
    const result = await conn.execute(
      `DELETE FROM ${TABLE}
       WHERE created_at < TO_TIMESTAMP(:cutoff, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')`,
      { cutoff: cutoff.toISOString() }
    );
    await conn.commit();
    return result.rowsAffected || 0;
  } finally {
    await conn.close();
  }
}

export async function handleFileConsent(params: {
  pool: any;
  context: any;
  activity: any;
  log: any;
}) {
  const { pool, context, activity, log } = params;
  
  if (activity.type !== "invoke" || activity.name !== "fileConsent/invoke") {
    return false;
  }

  const consent = parseFileConsentInvoke(activity);
  if (!consent) return false;

  const uploadId = consent.context?.uploadId;
  const pending = uploadId ? await getPendingUpload({ pool, id: uploadId }) : null;

  if (consent.action === "accept") {
    if (!pending) {
      await context.sendActivity("Upload expired");
      return true;
    }

    try {
      await uploadToConsentUrl({
        url: consent.uploadInfo.uploadUrl,
        buffer: pending.buffer,
        contentType: pending.contentType,
      });

      const card = buildFileInfoCard({
        filename: consent.uploadInfo.name,
        contentUrl: consent.uploadInfo.contentUrl,
        uniqueId: consent.uploadInfo.uniqueId,
        fileType: consent.uploadInfo.fileType,
      });

      await context.updateActivity({
        id: pending.consentCardActivityId,
        attachments: [card],
      });

      log.info("File uploaded", { uploadId, filename: pending.filename });
    } catch (error) {
      log.error("Upload failed", { error });
      await context.sendActivity("Upload failed");
    } finally {
      await removePendingUpload({ pool, id: uploadId });
    }
  } else {
    await removePendingUpload({ pool, id: uploadId });
    log.debug("User declined", { uploadId });
  }

  return true;
}