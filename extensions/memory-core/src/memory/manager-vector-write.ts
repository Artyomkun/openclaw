/**
 * Memory Core Plugin - Oracle Vector Write Module
 * 
 * PROPER ERROR HANDLING - NO ERROR SWALLOWING!
 */

import oracledb from "oracledb";

// ========================================================================
// Types
// ========================================================================

type VectorWriteDb = {
  execute: (sql: string, binds?: any) => Promise<oracledb.Result<any>>;
  prepare?: (sql: string) => {
    run: (...params: any[]) => any;
  };
  run?: (sql: string, params?: any[]) => any;
};

// ========================================================================
// Custom Errors
// ========================================================================

export class VectorWriteError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly id?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'VectorWriteError';
  }
}

export class VectorNotFoundError extends VectorWriteError {
  constructor(id: string) {
    super(`Vector not found: ${id}`, 'VECTOR_NOT_FOUND', id);
    this.name = 'VectorNotFoundError';
  }
}

// ========================================================================
// Vector Utilities
// ========================================================================

function vectorToJson(embedding: number[]): string {
  try {
    return JSON.stringify(embedding);
  } catch (error) {
    throw new VectorWriteError(
      'Failed to serialize vector to JSON',
      'SERIALIZATION_ERROR',
      undefined,
      error
    );
  }
}

function vectorToBuffer(embedding: number[]): Buffer {
  try {
    const buffer = Buffer.alloc(embedding.length * 8);
    for (let i = 0; i < embedding.length; i++) {
      buffer.writeDoubleLE(embedding[i], i * 8);
    }
    return buffer;
  } catch (error) {
    throw new VectorWriteError(
      'Failed to convert vector to buffer',
      'BUFFER_ERROR',
      undefined,
      error
    );
  }
}

function vectorToClob(embedding: number[]): string {
  try {
    return embedding.join(',');
  } catch (error) {
    throw new VectorWriteError(
      'Failed to convert vector to CLOB',
      'CLOB_ERROR',
      undefined,
      error
    );
  }
}

function vectorToOracleFormat(
  embedding: number[],
  format: 'json' | 'blob' | 'clob' = 'json'
): string | Buffer {
  if (!Array.isArray(embedding)) {
    throw new VectorWriteError(
      'Embedding must be an array of numbers',
      'INVALID_EMBEDDING',
      undefined,
      { received: typeof embedding }
    );
  }

  if (embedding.length === 0) {
    throw new VectorWriteError(
      'Embedding cannot be empty',
      'EMPTY_EMBEDDING',
      undefined,
      { length: 0 }
    );
  }

  switch (format) {
    case 'json':
      return vectorToJson(embedding);
    case 'blob':
      return vectorToBuffer(embedding);
    case 'clob':
      return vectorToClob(embedding);
    default:
      throw new VectorWriteError(
        `Unsupported format: ${format}`,
        'UNSUPPORTED_FORMAT',
        undefined,
        { format }
      );
  }
}

// ========================================================================
// Oracle Vector Write - NO ERROR SWALLOWING!
// ========================================================================

export async function replaceMemoryVectorRow(params: {
  db: VectorWriteDb;
  id: string;
  embedding: number[];
  tableName?: string;
  format?: 'json' | 'blob' | 'clob';
  useAIVector?: boolean;
}): Promise<void> {
  const tableName = params.tableName ?? "memory_index_chunks_vec";
  const format = params.format ?? 'json';
  const useAIVector = params.useAIVector ?? false;

  // Validate input
  if (!params.id || typeof params.id !== 'string') {
    throw new VectorWriteError(
      'Invalid ID: must be a non-empty string',
      'INVALID_ID',
      params.id
    );
  }

  if (!params.embedding || !Array.isArray(params.embedding)) {
    throw new VectorWriteError(
      'Invalid embedding: must be an array',
      'INVALID_EMBEDDING',
      params.id
    );
  }

  try {
    const embeddingData = vectorToOracleFormat(params.embedding, format);

    if (typeof params.db.execute !== 'function') {
      throw new VectorWriteError(
        'Database does not support execute method',
        'UNSUPPORTED_DB',
        params.id
      );
    }

    if (useAIVector) {
      // Oracle 23ai+: VECTOR type
      await params.db.execute(
        `MERGE INTO ${tableName} target
         USING (SELECT :id AS id, :embedding AS embedding FROM DUAL) source
         ON (target.id = source.id)
         WHEN MATCHED THEN
           UPDATE SET target.embedding = source.embedding,
                      target.updated_at = SYSTIMESTAMP
         WHEN NOT MATCHED THEN
           INSERT (id, embedding, created_at, updated_at)
           VALUES (source.id, source.embedding, SYSTIMESTAMP, SYSTIMESTAMP)`,
        {
          id: params.id,
          embedding: embeddingData,
        }
      );
    } else {
      // Legacy: JSON/CLOB/BLOB
      await params.db.execute(
        `MERGE INTO ${tableName} target
         USING (SELECT :id AS id, :embedding AS embedding FROM DUAL) source
         ON (target.id = source.id)
         WHEN MATCHED THEN
           UPDATE SET target.embedding = source.embedding,
                      target.updated_at = SYSTIMESTAMP
         WHEN NOT MATCHED THEN
           INSERT (id, embedding, created_at, updated_at)
           VALUES (source.id, source.embedding, SYSTIMESTAMP, SYSTIMESTAMP)`,
        {
          id: params.id,
          embedding: typeof embeddingData === 'string' ? embeddingData : embeddingData,
        }
      );
    }
  } catch (error) {
    // Re-throw with context
    if (error instanceof VectorWriteError) {
      throw error;
    }

    // Check for Oracle errors
    if (error && typeof error === 'object' && 'errorNum' in error) {
      const oracleError = error as { errorNum: number; message: string };
      
      if (oracleError.errorNum === 1) {
        throw new VectorWriteError(
          `Unique constraint violation for ID: ${params.id}`,
          'DUPLICATE_ID',
          params.id,
          error
        );
      }
      
      if (oracleError.errorNum === 2292) {
        throw new VectorWriteError(
          `Referential constraint violation for ID: ${params.id}`,
          'REFERENTIAL_ERROR',
          params.id,
          error
        );
      }
      
      if (oracleError.errorNum === 600) {
        throw new VectorWriteError(
          `Oracle internal error: ${oracleError.message}`,
          'ORACLE_INTERNAL_ERROR',
          params.id,
          error
        );
      }
    }

    throw new VectorWriteError(
      `Failed to replace vector row: ${params.id}`,
      'REPLACE_FAILED',
      params.id,
      error
    );
  }
}

// ========================================================================
// AI Vector Search - NO ERROR SWALLOWING!
// ========================================================================

export async function replaceMemoryVectorAIVector(params: {
  db: VectorWriteDb;
  id: string;
  embedding: number[];
  tableName?: string;
  dimension?: number;
}): Promise<void> {
  const tableName = params.tableName ?? "memory_index_chunks_vec";
  const dimension = params.dimension ?? params.embedding.length;

  if (!params.id || typeof params.id !== 'string') {
    throw new VectorWriteError('Invalid ID', 'INVALID_ID', params.id);
  }

  if (!params.embedding || !Array.isArray(params.embedding) || params.embedding.length === 0) {
    throw new VectorWriteError(
      'Invalid embedding: must be a non-empty array',
      'INVALID_EMBEDDING',
      params.id
    );
  }

  if (typeof params.db.execute !== 'function') {
    throw new VectorWriteError(
      'AI Vector Search requires Oracle database with execute method',
      'UNSUPPORTED_DB',
      params.id
    );
  }

  try {
    const vectorString = `VECTOR('[${params.embedding.join(',')}]', ${dimension}, FLOAT32)`;

    await params.db.execute(
      `MERGE INTO ${tableName} target
       USING (SELECT :id AS id, ${vectorString} AS embedding FROM DUAL) source
       ON (target.id = source.id)
       WHEN MATCHED THEN
         UPDATE SET target.embedding = source.embedding,
                    target.updated_at = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (id, embedding, created_at, updated_at)
         VALUES (source.id, source.embedding, SYSTIMESTAMP, SYSTIMESTAMP)`,
      {
        id: params.id,
      }
    );
  } catch (error) {
    if (error instanceof VectorWriteError) {
      throw error;
    }

    throw new VectorWriteError(
      `Failed to replace AI vector row: ${params.id}`,
      'AI_VECTOR_FAILED',
      params.id,
      error
    );
  }
}

// ========================================================================
// Batch Operations - NO ERROR SWALLOWING!
// ========================================================================

export async function batchReplaceMemoryVectors(params: {
  db: VectorWriteDb;
  entries: Array<{ id: string; embedding: number[] }>;
  tableName?: string;
  format?: 'json' | 'blob' | 'clob';
  useAIVector?: boolean;
}): Promise<void> {
  if (params.entries.length === 0) {
    return;
  }

  const tableName = params.tableName ?? "memory_index_chunks_vec";
  const format = params.format ?? 'json';
  const useAIVector = params.useAIVector ?? false;

  // Validate all entries
  const invalidEntries = params.entries.filter(
    e => !e.id || typeof e.id !== 'string' || !e.embedding || !Array.isArray(e.embedding)
  );

  if (invalidEntries.length > 0) {
    throw new VectorWriteError(
      `${invalidEntries.length} entries have invalid format`,
      'INVALID_BATCH_ENTRY',
      undefined,
      { invalidEntries }
    );
  }

  if (typeof params.db.execute !== 'function') {
    // Fallback to individual operations with error aggregation
    const errors: Error[] = [];

    for (const entry of params.entries) {
      try {
        await replaceMemoryVectorRow({
          db: params.db,
          id: entry.id,
          embedding: entry.embedding,
          tableName,
          format,
          useAIVector,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      throw new VectorWriteError(
        `Batch operation completed with ${errors.length} errors`,
        'BATCH_PARTIAL_FAILURE',
        undefined,
        { errors, total: params.entries.length }
      );
    }

    return;
  }

  try {
    // Prepare batch data
    const ids: string[] = [];
    const embeddings: (string | Buffer)[] = [];

    for (const entry of params.entries) {
      ids.push(entry.id);
      embeddings.push(vectorToOracleFormat(entry.embedding, format));
    }

    if (useAIVector) {
      const vectorStrings = params.entries.map(
        (entry) => `VECTOR('[${entry.embedding.join(',')}]', ${entry.embedding.length}, FLOAT32)`
      );

      await params.db.execute(`
        BEGIN
          FORALL i IN 1..:count
            MERGE INTO ${tableName} target
            USING (SELECT :id(i) AS id, ${vectorStrings.map((_, i) => `:vec${i}`).join(' || ')} AS embedding FROM DUAL) source
            ON (target.id = source.id)
            WHEN MATCHED THEN
              UPDATE SET target.embedding = source.embedding,
                         target.updated_at = SYSTIMESTAMP
            WHEN NOT MATCHED THEN
              INSERT (id, embedding, created_at, updated_at)
              VALUES (source.id, source.embedding, SYSTIMESTAMP, SYSTIMESTAMP);
      `, {
        count: params.entries.length,
        id: ids,
        ...Object.fromEntries(vectorStrings.map((v, i) => [`vec${i}`, v])),
      });
    } else {
      const placeholders = params.entries.map((_, i) => 
        `(:id${i}, :embedding${i})`
      ).join(',');

      await params.db.execute(
        `INSERT ALL
         ${placeholders
           .split(',')
           .map((_, i) => 
             `INTO ${tableName} (id, embedding) VALUES (:id${i}, :embedding${i})`
           )
           .join('\n')}
         SELECT 1 FROM DUAL`,
        {
          ...Object.fromEntries(ids.map((id, i) => [`id${i}`, id])),
          ...Object.fromEntries(embeddings.map((emb, i) => [`embedding${i}`, emb])),
        }
      );
    }
  } catch (error) {
    throw new VectorWriteError(
      `Batch operation failed: ${params.entries.length} entries`,
      'BATCH_FAILED',
      undefined,
      error
    );
  }
}

// ========================================================================
// Delete - NO ERROR SWALLOWING!
// ========================================================================

export async function deleteMemoryVectorRow(params: {
  db: VectorWriteDb;
  id: string;
  tableName?: string;
}): Promise<boolean> {
  const tableName = params.tableName ?? "memory_index_chunks_vec";

  if (!params.id || typeof params.id !== 'string') {
    throw new VectorWriteError('Invalid ID', 'INVALID_ID', params.id);
  }

  if (typeof params.db.execute !== 'function') {
    throw new VectorWriteError(
      'Database does not support execute method',
      'UNSUPPORTED_DB',
      params.id
    );
  }

  try {
    const result = await params.db.execute(
      `DELETE FROM ${tableName} WHERE id = :id`,
      { id: params.id }
    );

    const rowsAffected = result.rowsAffected ?? 0;

    if (rowsAffected === 0) {
      throw new VectorNotFoundError(params.id);
    }

    return true;
  } catch (error) {
    if (error instanceof VectorWriteError) {
      throw error;
    }

    throw new VectorWriteError(
      `Failed to delete vector: ${params.id}`,
      'DELETE_FAILED',
      params.id,
      error
    );
  }
}

// ========================================================================
// Read - NO ERROR SWALLOWING!
// ========================================================================

export async function readMemoryVectorRow(params: {
  db: VectorWriteDb;
  id: string;
  tableName?: string;
  format?: 'json' | 'blob' | 'clob';
}): Promise<number[]> {
  const tableName = params.tableName ?? "memory_index_chunks_vec";
  const format = params.format ?? 'json';

  if (!params.id || typeof params.id !== 'string') {
    throw new VectorWriteError('Invalid ID', 'INVALID_ID', params.id);
  }

  if (typeof params.db.execute !== 'function') {
    throw new VectorWriteError(
      'Database does not support execute method',
      'UNSUPPORTED_DB',
      params.id
    );
  }

  try {
    const result = await params.db.execute(
      `SELECT embedding FROM ${tableName} WHERE id = :id`,
      { id: params.id }
    );

    if (!result.rows || result.rows.length === 0) {
      throw new VectorNotFoundError(params.id);
    }

    const embeddingData = result.rows[0][0];

    if (embeddingData === null || embeddingData === undefined) {
      throw new VectorWriteError(
        `Embedding is null for ID: ${params.id}`,
        'NULL_EMBEDDING',
        params.id
      );
    }

    // Parse based on format
    if (typeof embeddingData === 'string') {
      if (format === 'json') {
        try {
          return JSON.parse(embeddingData);
        } catch (parseError) {
          throw new VectorWriteError(
            `Failed to parse JSON embedding: ${params.id}`,
            'JSON_PARSE_ERROR',
            params.id,
            parseError
          );
        }
      } else if (format === 'clob') {
        const parts = embeddingData.split(',');
        const result = parts.map(Number);
        
        if (result.some(isNaN)) {
          throw new VectorWriteError(
            `Invalid number in CLOB embedding: ${params.id}`,
            'CLOB_PARSE_ERROR',
            params.id,
            { data: embeddingData.substring(0, 100) }
          );
        }
        
        return result;
      }
    }

    if (Buffer.isBuffer(embeddingData) && format === 'blob') {
      if (embeddingData.length % 8 !== 0) {
        throw new VectorWriteError(
          `Invalid BLOB size for embedding: ${params.id}`,
          'BLOB_SIZE_ERROR',
          params.id,
          { size: embeddingData.length }
        );
      }

      const vector: number[] = [];
      for (let i = 0; i < embeddingData.length; i += 8) {
        vector.push(embeddingData.readDoubleLE(i));
      }
      return vector;
    }

    throw new VectorWriteError(
      `Unsupported embedding format: ${format}`,
      'UNSUPPORTED_FORMAT',
      params.id,
      { format, dataType: typeof embeddingData }
    );
  } catch (error) {
    if (error instanceof VectorWriteError) {
      throw error;
    }

    throw new VectorWriteError(
      `Failed to read vector: ${params.id}`,
      'READ_FAILED',
      params.id,
      error
    );
  }
}

// ========================================================================
// Utilities - NO ERROR SWALLOWING!
// ========================================================================

export function vectorToBlob(embedding: number[]): Buffer {
  return vectorToBuffer(embedding);
}

export function parseVector(data: any, format: 'json' | 'blob' | 'clob' = 'json'): number[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (typeof data === 'string') {
    if (format === 'json') {
      try {
        return JSON.parse(data);
      } catch (error) {
        throw new VectorWriteError(
          'Failed to parse JSON vector',
          'PARSE_ERROR',
          undefined,
          error
        );
      }
    } else if (format === 'clob') {
      const parts = data.split(',');
      return parts.map(Number);
    }
  }

  if (Buffer.isBuffer(data) && format === 'blob') {
    if (data.length % 8 !== 0) {
      throw new VectorWriteError(
        'Invalid BLOB size for vector',
        'BLOB_SIZE_ERROR',
        undefined,
        { size: data.length }
      );
    }

    const vector: number[] = [];
    for (let i = 0; i < data.length; i += 8) {
      vector.push(data.readDoubleLE(i));
    }
    return vector;
  }

  throw new VectorWriteError(
    `Cannot parse vector from type: ${typeof data}`,
    'PARSE_ERROR',
    undefined,
    { dataType: typeof data, format }
  );
}

// ========================================================================
// Export
// ========================================================================

export default {
  replaceMemoryVectorRow,
  replaceMemoryVectorAIVector,
  batchReplaceMemoryVectors,
  deleteMemoryVectorRow,
  readMemoryVectorRow,
  vectorToBlob,
  parseVector,
  // Errors
  VectorWriteError,
  VectorNotFoundError,
};