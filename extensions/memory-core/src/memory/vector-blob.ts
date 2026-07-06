/**
 * Memory Core - Vector Encoding for Oracle
 */

// ========================================================================
// Custom Errors
// ========================================================================

export class VectorEncodingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'VectorEncodingError';
  }
}

// ========================================================================
// Encoding
// ========================================================================

/**
 * Convert vector to JSON string.
 * @throws VectorEncodingError on serialization failure
 */
export const vectorToJson = (embedding: number[]): string => {
  try {
    return JSON.stringify(embedding);
  } catch (error) {
    throw new VectorEncodingError(
      `Failed to serialize vector: ${error instanceof Error ? error.message : String(error)}`,
      'SERIALIZATION_ERROR',
      error
    );
  }
};

/**
 * Convert vector to Oracle VECTOR type.
 * @throws VectorEncodingError on invalid input
 */
export const vectorToOracleVector = (embedding: number[]): string => {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new VectorEncodingError(
      'Invalid embedding: must be non-empty array',
      'INVALID_EMBEDDING'
    );
  }
  
  const values = embedding.join(',');
  return `VECTOR('[${values}]', ${embedding.length}, FLOAT32)`;
};

/**
 * Convert vector to CLOB string.
 */
export const vectorToClob = (embedding: number[]): string => {
  return embedding.join(',');
};

/**
 * Convert vector to Buffer (for legacy SQLite).
 */
export const vectorToBlob = (embedding: number[]): Buffer => {
  try {
    return Buffer.from(new Float32Array(embedding).buffer);
  } catch (error) {
    throw new VectorEncodingError(
      `Failed to convert vector to blob: ${error instanceof Error ? error.message : String(error)}`,
      'BLOB_CONVERSION_ERROR',
      error
    );
  }
};

// ========================================================================
// Parsing
// ========================================================================

/**
 * Parse vector from JSON string.
 * @throws VectorEncodingError on parse failure
 */
export const parseVectorFromJson = (data: string): number[] => {
  try {
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed)) {
      throw new VectorEncodingError(
        'Invalid vector format: expected array',
        'INVALID_FORMAT'
      );
    }
    
    if (parsed.length === 0) {
      throw new VectorEncodingError(
        'Empty vector',
        'EMPTY_VECTOR'
      );
    }
    
    return parsed;
  } catch (error) {
    if (error instanceof VectorEncodingError) {
      throw error;
    }
    throw new VectorEncodingError(
      `Failed to parse vector: ${error instanceof Error ? error.message : String(error)}`,
      'PARSE_ERROR',
      error
    );
  }
};

/**
 * Parse vector from CLOB string.
 * @throws VectorEncodingError on invalid format
 */
export const parseVectorFromClob = (data: string): number[] => {
  try {
    const parts = data.split(',').map(s => s.trim());
    const result = parts.map(Number);
    
    if (result.some(isNaN)) {
      throw new VectorEncodingError(
        `Invalid numbers in vector data: ${data.substring(0, 100)}`,
        'INVALID_NUMBERS'
      );
    }
    
    return result;
  } catch (error) {
    if (error instanceof VectorEncodingError) {
      throw error;
    }
    throw new VectorEncodingError(
      `Failed to parse vector from CLOB: ${error instanceof Error ? error.message : String(error)}`,
      'CLOB_PARSE_ERROR',
      error
    );
  }
};

/**
 * Parse vector from Buffer (Float32Array).
 * @throws VectorEncodingError on invalid buffer
 */
export const parseVectorFromBlob = (data: Buffer): number[] => {
  try {
    if (!Buffer.isBuffer(data)) {
      throw new VectorEncodingError(
        'Expected Buffer',
        'INVALID_BUFFER'
      );
    }
    
    if (data.length % 4 !== 0) {
      throw new VectorEncodingError(
        `Invalid buffer size: ${data.length} bytes (must be multiple of 4)`,
        'INVALID_BUFFER_SIZE'
      );
    }
    
    const arr = new Float32Array(data.buffer, data.byteOffset, data.length / 4);
    return Array.from(arr);
  } catch (error) {
    if (error instanceof VectorEncodingError) {
      throw error;
    }
    throw new VectorEncodingError(
      `Failed to parse vector from blob: ${error instanceof Error ? error.message : String(error)}`,
      'BLOB_PARSE_ERROR',
      error
    );
  }
};

/**
 * Auto-detect and parse vector from any format.
 * @throws VectorEncodingError on parse failure
 */
export const parseVector = (data: string | Buffer): number[] => {
  try {
    // String
    if (typeof data === 'string') {
      // Try JSON first
      try {
        return parseVectorFromJson(data);
      } catch {
        // If JSON fails, try CLOB
        return parseVectorFromClob(data);
      }
    }
    
    // Buffer
    if (Buffer.isBuffer(data)) {
      return parseVectorFromBlob(data);
    }
    
    throw new VectorEncodingError(
      `Unsupported vector data type: ${typeof data}`,
      'UNSUPPORTED_TYPE'
    );
  } catch (error) {
    if (error instanceof VectorEncodingError) {
      throw error;
    }
    throw new VectorEncodingError(
      `Failed to parse vector: ${error instanceof Error ? error.message : String(error)}`,
      'PARSE_ERROR',
      error
    );
  }
};

// ========================================================================
// Export
// ========================================================================

export default {
  vectorToJson,
  vectorToOracleVector,
  vectorToClob,
  vectorToBlob,
  parseVectorFromJson,
  parseVectorFromClob,
  parseVectorFromBlob,
  parseVector,
  VectorEncodingError,
};