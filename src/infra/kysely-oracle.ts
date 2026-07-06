// Adapts Oracle DB connection to Kysely.
import oracledb from "oracledb";
import type {
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  TransactionSettings,
} from "kysely";
import {
  CompiledQuery,
  OracleAdapter,
  OracleIntrospector,
  OracleQueryCompiler,
  createQueryId,
} from "kysely";

type MaybePromise<T> = T | Promise<T>;

/** Configuration for the Oracle Kysely dialect. */
export type OracleKyselyDialectConfig = {
  connection: oracledb.Connection | (() => MaybePromise<oracledb.Connection>);
  onCreateConnection?: (connection: DatabaseConnection) => MaybePromise<void>;
};

/** Kysely dialect backed by an Oracle DB connection. */
export class OracleKyselyDialect implements Dialect {
  readonly #config: OracleKyselyDialectConfig;

  constructor(config: OracleKyselyDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  createDriver(): Driver {
    return new OracleKyselyDriver(this.#config);
  }

  createQueryCompiler(): QueryCompiler {
    return new OracleQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new OracleAdapter();
  }

  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new OracleIntrospector(db);
  }
}

class OracleKyselyDriver implements Driver {
  readonly #config: OracleKyselyDialectConfig;
  #connection?: oracledb.Connection;
  #dbConnection?: DatabaseConnection;

  constructor(config: OracleKyselyDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  async init(): Promise<void> {
    this.#connection =
      typeof this.#config.connection === "function"
        ? await this.#config.connection()
        : this.#config.connection;

    this.#dbConnection = new OracleKyselyConnection(this.#connection);
    await this.#config.onCreateConnection?.(this.#dbConnection);
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.#dbConnection!;
  }

  async beginTransaction(
    connection: DatabaseConnection,
    _settings: TransactionSettings,
  ): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("SAVEPOINT kysely_tx"));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  async releaseConnection(): Promise<void> {
    // Connection stays open for reuse
  }

  async destroy(): Promise<void> {
    if (this.#connection) {
      await this.#connection.close();
      this.#connection = undefined;
      this.#dbConnection = undefined;
    }
  }
}

class OracleKyselyConnection implements DatabaseConnection {
  readonly #conn: oracledb.Connection;

  constructor(conn: oracledb.Connection) {
    this.#conn = conn;
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;
    
    // Convert Kysely parameters to Oracle bind format
    const bindParams: Record<string, unknown> = {};
    const sqlParams = parameters as Array<unknown>;
    if (sqlParams && sqlParams.length > 0) {
      for (let i = 0; i < sqlParams.length; i++) {
        bindParams[`p${i}`] = sqlParams[i];
      }
    }

    const isSelect = sql.trimStart().toUpperCase().startsWith("SELECT");
    const isReturning = sql.trimStart().toUpperCase().includes("RETURNING");

    if (isSelect || isReturning) {
      const result = await this.#conn.execute<Record<string, unknown>>(sql, bindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      return {
        rows: (result.rows ?? []) as O[],
      };
    }

    const result = await this.#conn.execute(sql, bindParams, {
      autoCommit: false,
    });

    return {
      numAffectedRows: BigInt(result.rowsAffected ?? 0),
      rows: [],
    };
  }

  async *streamQuery<O>(
    compiledQuery: CompiledQuery,
    chunkSize = 100,
  ): AsyncIterableIterator<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;
    const bindParams: Record<string, unknown> = {};
    const sqlParams = parameters as Array<unknown>;
    if (sqlParams && sqlParams.length > 0) {
      for (let i = 0; i < sqlParams.length; i++) {
        bindParams[`p${i}`] = sqlParams[i];
      }
    }

    const stream = this.#conn.queryStream(sql, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    let buffer: O[] = [];
    for await (const row of stream as AsyncIterable<Record<string, unknown>>) {
      buffer.push(row as O);
      if (buffer.length >= chunkSize) {
        yield { rows: buffer };
        buffer = [];
      }
    }
    if (buffer.length > 0) {
      yield { rows: buffer };
    }
  }
}

// ─── Factory Function ──────────────────────────────────────

export function getOracleKysely<T>(connection: oracledb.Connection): Kysely<T> {
  const { Kysely } = require("kysely") as typeof import("kysely");
  return new Kysely<T>({
    dialect: new OracleKyselyDialect({ connection }),
  });
}