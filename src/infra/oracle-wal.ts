import oracledb from 'oracledb';

export type OracleConnectionPoolOptions = {
  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
  databaseLabel?: string;
  onError?: (error: unknown) => void;
};

/**
 * Oracle connection configuration
 */
export type OracleConnectionOptions = OracleConnectionPoolOptions & {
  user: string;
  password: string;
  connectString: string;
  usePool?: boolean;
  enableLogging?: boolean;
};

export class OracleConnectionManager {
  private static instance: OracleConnectionManager | null = null;
  private pool: oracledb.Pool | null = null;
  private options: OracleConnectionOptions;
  private isClosing = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor(options: OracleConnectionOptions) {
    this.options = {
      poolMin: options.poolMin ?? 5,
      poolMax: options.poolMax ?? 50,
      poolIncrement: options.poolIncrement ?? 5,
      connectionTimeout: options.connectionTimeout ?? 30000,
      queryTimeout: options.queryTimeout ?? 60000,
      databaseLabel: options.databaseLabel ?? 'oracle-connection',
      ...options
    };
  }

  static getInstance(options: OracleConnectionOptions): OracleConnectionManager {
    if (!OracleConnectionManager.instance) {
      OracleConnectionManager.instance = new OracleConnectionManager(options);
    }
    return OracleConnectionManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.pool) {
      return;
    }

    try {
      this.pool = await oracledb.createPool({
        user: this.options.user,
        password: this.options.password,
        connectString: this.options.connectString,
        poolMin: this.options.poolMin,
        poolMax: this.options.poolMax,
        poolIncrement: this.options.poolIncrement,
        connectionTimeout: this.options.connectionTimeout,
        queueTimeout: this.options.connectionTimeout,
      });
      this.startHealthCheck();

      if (this.options.enableLogging) {
        console.log(`[${this.options.databaseLabel}] Connection pool initialized`);
      }
    } catch (error) {
      this.options.onError?.(error);
      throw new Error(`Failed to initialize Oracle connection pool: ${error}`);
    }
  }

  async getConnection(): Promise<oracledb.Connection> {
    if (this.isClosing) {
      throw new Error('Connection pool is closing');
    }

    if (!this.pool) {
      await this.initialize();
    }

    try {
      const connection = await this.pool!.getConnection();
      if (this.options.queryTimeout) {
        await connection.execute(
          `ALTER SESSION SET SQL_TRACE = FALSE`
        );
      }

      if (this.options.enableLogging) {
        console.log(`[${this.options.databaseLabel}] Connection acquired`);
      }

      return connection;
    } catch (error) {
      this.options.onError?.(error);
      throw new Error(`Failed to get Oracle connection: ${error}`);
    }
  }

  async execute<T = any>(
    sql: string,
    params?: any,
    options?: { autoCommit?: boolean }
  ): Promise<oracledb.Result<T>> {
    const connection = await this.getConnection();
    try {
      const result = await connection.execute<T>(sql, params, {
        autoCommit: options?.autoCommit ?? true
      });
      
      if (this.options.enableLogging) {
        console.log(`[${this.options.databaseLabel}] Query executed: ${sql.substring(0, 100)}...`);
      }
      
      return result;
    } finally {
      await connection.close();
    }
  }

  async transaction<T>(
    callback: (connection: oracledb.Connection) => Promise<T>
  ): Promise<T> {
    const connection = await this.getConnection();
    try {
      await connection.execute('BEGIN');
      const result = await callback(connection);
      await connection.execute('COMMIT');
      return result;
    } catch (error) {
      await connection.execute('ROLLBACK');
      throw error;
    } finally {
      await connection.close();
    }
  }

  private async checkHealth(): Promise<boolean> {
    if (!this.pool || this.isClosing) {
      return false;
    }

    try {
      const connection = await this.pool.getConnection();
      await connection.execute('SELECT 1 FROM DUAL');
      await connection.close();
      return true;
    } catch (error) {
      this.options.onError?.(error);
      return false;
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      if (this.isClosing) {
        return;
      }

      const healthy = await this.checkHealth();
      if (!healthy && this.options.enableLogging) {
        console.warn(`[${this.options.databaseLabel}] Health check failed`);
      }
    }, 60000);
  }

  async close(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.pool) {
      try {
        await this.pool.close();
        this.pool = null;
        
        if (this.options.enableLogging) {
          console.log(`[${this.options.databaseLabel}] Connection pool closed`);
        }
      } catch (error) {
        this.options.onError?.(error);
        throw new Error(`Failed to close Oracle connection pool: ${error}`);
      }
    }

    OracleConnectionManager.instance = null;
  }

  getStatus(): {
    isOpen: boolean;
    poolMin: number;
    poolMax: number;
    connectionsInUse?: number;
    connectionsOpen?: number;
  } {
    if (!this.pool) {
      return { isOpen: false, poolMin: 0, poolMax: 0 };
    }

    return {
      isOpen: true,
      poolMin: this.options.poolMin || 5,
      poolMax: this.options.poolMax || 50,
      connectionsInUse: (this.pool as any).connectionsInUse,
      connectionsOpen: (this.pool as any).connectionsOpen,
    };
  }
}

export async function createOracleConnection(
  options: OracleConnectionOptions
): Promise<oracledb.Connection> {
  const manager = OracleConnectionManager.getInstance(options);
  await manager.initialize();
  return manager.getConnection();
}

export async function createOraclePool(
  options: OracleConnectionOptions
): Promise<OracleConnectionManager> {
  const manager = OracleConnectionManager.getInstance(options);
  await manager.initialize();
  return manager;
}

export function isOracleStorageSupported(): boolean {
  return true;
}

export function getOracleDefaultOptions(): Partial<OracleConnectionOptions> {
  return {
    poolMin: 5,
    poolMax: 50,
    poolIncrement: 5,
    connectionTimeout: 30000,
    queryTimeout: 60000,
    enableLogging: process.env.NODE_ENV === 'development',
  };
}

export interface OracleCompatibleDatabase {
  execute: (sql: string, params?: any) => Promise<any>;
  exec: (sql: string) => Promise<void>;
  prepare: (sql: string) => { all: (params?: any) => any[]; get: (params?: any) => any; run: (params?: any) => void };
  close: () => Promise<void>;
}

export function createOracleCompatibleDatabase(
  connection: oracledb.Connection | OracleConnectionManager
): OracleCompatibleDatabase {
  const getConnection = async (): Promise<oracledb.Connection> => {
    if (connection instanceof OracleConnectionManager) {
      return connection.getConnection();
    }
    return connection;
  };

  return {
    execute: async (sql: string, params?: any) => {
      const conn = await getConnection();
      try {
        return await conn.execute(sql, params);
      } finally {
        if (connection instanceof OracleConnectionManager) {
          await conn.close();
        }
      }
    },
    exec: async (sql: string) => {
      const conn = await getConnection();
      try {
        await conn.execute(sql);
      } finally {
        if (connection instanceof OracleConnectionManager) {
          await conn.close();
        }
      }
    },
    prepare: (sql: string) => ({
      all: (params?: any) => {
        throw new Error('Oracle prepare/all not implemented, use execute instead');
      },
      get: (params?: any) => {
        throw new Error('Oracle prepare/get not implemented, use execute instead');
      },
      run: (params?: any) => {
        throw new Error('Oracle prepare/run not implemented, use execute instead');
      }
    }),
    close: async () => {
      if (connection instanceof OracleConnectionManager) {
        await connection.close();
      }
    }
  };
}