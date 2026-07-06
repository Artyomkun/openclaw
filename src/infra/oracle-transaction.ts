import oracledb from 'oracledb';

const transactionDepthByConnection = new WeakMap<oracledb.Connection, number>();
const savepointNamesByConnection = new WeakMap<oracledb.Connection, string[]>();

let nextSavepointId = 0;

function nextSavepointName(): string {
  nextSavepointId += 1;
  return `openclaw_tx_${nextSavepointId}`;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof (value as { then?: unknown }).then === "function");
}

function assertSyncTransactionResult(value: unknown): void {
  if (isPromiseLike(value)) {
    throw new Error(
      "Oracle write transactions must be synchronous; Promise returns are not supported."
    );
  }
}

function getTransactionDepth(connection: oracledb.Connection): number {
  return transactionDepthByConnection.get(connection) ?? 0;
}

function setTransactionDepth(connection: oracledb.Connection, depth: number): void {
  if (depth <= 0) {
    transactionDepthByConnection.delete(connection);
    savepointNamesByConnection.delete(connection);
    return;
  }
  transactionDepthByConnection.set(connection, depth);
}

function getSavepointStack(connection: oracledb.Connection): string[] {
  return savepointNamesByConnection.get(connection) ?? [];
}

function pushSavepoint(connection: oracledb.Connection, name: string): void {
  const stack = getSavepointStack(connection);
  stack.push(name);
  savepointNamesByConnection.set(connection, stack);
}

function popSavepoint(connection: oracledb.Connection): string | undefined {
  const stack = getSavepointStack(connection);
  const name = stack.pop();
  savepointNamesByConnection.set(connection, stack);
  return name;
}

export async function runOracleTransaction<T>(
  connection: oracledb.Connection,
  operation: () => T | Promise<T>
): Promise<T> {
  const depth = getTransactionDepth(connection);
  if (depth > 0) {
    const savepointName = nextSavepointName();
    pushSavepoint(connection, savepointName);
    setTransactionDepth(connection, depth + 1);
    
    try {
      const result = operation();
      const finalResult = isPromiseLike(result) ? await result : result;
      assertSyncTransactionResult(finalResult);
      await connection.execute(`RELEASE SAVEPOINT ${savepointName}`);
      popSavepoint(connection);
      
      return finalResult;
    } catch (error) {
      try {
        await connection.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      } finally {
        await connection.execute(`RELEASE SAVEPOINT ${savepointName}`);
        popSavepoint(connection);
      }
      throw error;
    } finally {
      setTransactionDepth(connection, depth);
    }
  }
  setTransactionDepth(connection, 1);
  let transactionActive = true;
  
  try {
    await connection.execute('BEGIN');
    
    let result: T;
    try {
      result = await operation();
      assertSyncTransactionResult(result);
    } catch (error) {
      try {
        await connection.execute('ROLLBACK');
        transactionActive = false;
      } catch {}
      throw error;
    }
    try {
      await connection.execute('COMMIT');
      transactionActive = false;
      return result;
    } catch (error) {
      try {
        await connection.execute('ROLLBACK');
        transactionActive = false;
      } catch {}
      throw error;
    }
  } finally {
    if (!transactionActive) {
      setTransactionDepth(connection, 0);
    }
  }
}

export function runOracleTransactionSync<T>(
  connection: oracledb.Connection,
  operation: () => T
): T {
  const depth = getTransactionDepth(connection);
  
  if (depth > 0) {
    const savepointName = nextSavepointName();
    pushSavepoint(connection, savepointName);
    setTransactionDepth(connection, depth + 1);
    
    try {
      const result = operation();
      assertSyncTransactionResult(result);
      connection.execute(`RELEASE SAVEPOINT ${savepointName}`);
      popSavepoint(connection);
      
      return result;
    } catch (error) {
      try {
        connection.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      } finally {
        connection.execute(`RELEASE SAVEPOINT ${savepointName}`);
        popSavepoint(connection);
      }
      throw error;
    } finally {
      setTransactionDepth(connection, depth);
    }
  }

  setTransactionDepth(connection, 1);
  let transactionActive = true;
  
  try {
    connection.execute('BEGIN');
    
    let result: T;
    try {
      result = operation();
      assertSyncTransactionResult(result);
    } catch (error) {
      try {
        connection.execute('ROLLBACK');
        transactionActive = false;
      } catch {}
      throw error;
    }
    
    try {
      connection.execute('COMMIT');
      transactionActive = false;
      return result;
    } catch (error) {
      try {
        connection.execute('ROLLBACK');
        transactionActive = false;
      } catch {}
      throw error;
    }
  } finally {
    if (!transactionActive) {
      setTransactionDepth(connection, 0);
    }
  }
}

export async function runOracleTransactionBatch<T>(
  connection: oracledb.Connection,
  operations: Array<() => T | Promise<T>>
): Promise<T[]> {
  return runOracleTransaction(connection, async () => {
    const results: T[] = [];
    for (const operation of operations) {
      results.push(await operation());
    }
    return results;
  });
}

export function isOracleTransactionActive(connection: oracledb.Connection): boolean {
  return getTransactionDepth(connection) > 0;
}

export function getOracleTransactionDepth(connection: oracledb.Connection): number {
  return getTransactionDepth(connection);
}

export function runSqliteImmediateTransactionSync<T>(
  db: any,
  operation: () => T
): T {
  if (db && typeof db === 'object' && 'execute' in db) {
    return runOracleTransactionSync(db as oracledb.Connection, operation);
  }
  throw new Error('Oracle connection required');
}