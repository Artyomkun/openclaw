import { z } from "zod";
import oracledb from "oracledb";

// ============================================
// SCHEMAS
// ============================================

const CronRunLogEntrySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  runId: z.string(),
  status: z.enum(["ok", "error", "skipped"]),
  ts: z.number(),
  summary: z.string().optional(),
  error: z.string().optional(),
  deliveryStatus: z.enum(["delivered", "not-delivered", "unknown", "not-requested"]).optional(),
});

type CronRunLogEntry = z.infer<typeof CronRunLogEntrySchema>;

// ============================================
// ORACLE CONFIG
// ============================================

const ORACLE_CONFIG = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_DSN,
};

// ============================================
// MAIN
// ============================================

export async function appendCronRunLog(entry: CronRunLogEntry): Promise<void> {
  const parsed = CronRunLogEntrySchema.parse(entry);
  
  let connection;
  try {
    connection = await oracledb.getConnection(ORACLE_CONFIG);
    await connection.execute(
      `INSERT INTO cron_run_log (
        id, job_id, run_id, status, ts, summary, error, delivery_status
      ) VALUES (
        :id, :jobId, :runId, :status, :ts, :summary, :error, :deliveryStatus
      )`,
      {
        id: parsed.id,
        jobId: parsed.jobId,
        runId: parsed.runId,
        status: parsed.status,
        ts: parsed.ts,
        summary: parsed.summary || null,
        error: parsed.error || null,
        deliveryStatus: parsed.deliveryStatus || "not-requested",
      }
    );
    await connection.commit();
  } catch (error) {
    console.error("Failed to insert cron run log:", error);
    throw error;
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
  }
}

export async function readCronRunLogEntries(params: {
  jobId?: string;
  limit?: number;
}): Promise<CronRunLogEntry[]> {
  const limit = Math.min(params.limit || 100, 1000);
  let connection;
  
  try {
    connection = await oracledb.getConnection(ORACLE_CONFIG);
    const result = await connection.execute(
      `SELECT * FROM cron_run_log 
       WHERE :jobId IS NULL OR job_id = :jobId
       ORDER BY ts DESC
       FETCH FIRST :limit ROWS ONLY`,
      {
        jobId: params.jobId || null,
        limit: limit,
      }
    );
    
    return (result.rows || []).map((row: any) => ({
      id: row[0],
      jobId: row[1],
      runId: row[2],
      status: row[3],
      ts: row[4],
      summary: row[5],
      error: row[6],
      deliveryStatus: row[7] || "not-requested",
    }));
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
  }
}

export async function pruneCronRunLog(jobId: string, keepLines: number = 2000): Promise<void> {
  let connection;
  
  try {
    connection = await oracledb.getConnection(ORACLE_CONFIG);
    await connection.execute(
      `DELETE FROM cron_run_log 
       WHERE job_id = :jobId 
       AND id NOT IN (
         SELECT id FROM cron_run_log 
         WHERE job_id = :jobId 
         ORDER BY ts DESC 
         FETCH FIRST :keepLines ROWS ONLY
       )`,
      { jobId, keepLines }
    );
    await connection.commit();
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
  }
}