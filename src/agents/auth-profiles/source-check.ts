import oracledb from "oracledb";

// ============================================
// CONFIG
// ============================================

const ORACLE_CONFIG = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_DSN,
};

// ============================================
// MAIN
// ============================================

export function hasAnyAuthProfileStoreSource(agentDir?: string): Promise<boolean> {
  return hasOracleAuthProfile(agentDir);
}

export async function hasLocalAuthProfileStoreSource(agentDir?: string): Promise<boolean> {
  return hasOracleAuthProfile(agentDir);
}

// ============================================
// ORACLE DIRECT
// ============================================

async function hasOracleAuthProfile(agentDir?: string): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(ORACLE_CONFIG);
    const result = await connection.execute(
      `SELECT COUNT(*) as count 
       FROM auth_profiles 
       WHERE agent_dir = :agentDir OR (:agentDir IS NULL AND agent_dir IS NULL)`,
      { agentDir: agentDir || null }
    );
    
    return result.rows && result.rows[0]?.[0] > 0;
  } catch {
    return false;
  } finally {
    if (connection) {
      try { 
        await connection.close(); 
      } 
      catch (closeError) {
        console.error("Failed to close Oracle connection:", closeError);
      }
    }
  }
}