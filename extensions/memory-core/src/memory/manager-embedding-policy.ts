/**
 * Memory Core Plugin - Oracle Embedding Policy Module
 * 
 * Pure policy layer for embedding operations.
 * No memory or Oracle coupling - just embedding logic.
 * 
 * Responsibilities:
 * 1. Batch building with token estimation
 * 2. Retry policy with exponential backoff
 * 3. Split strategy for large payloads
 * 4. Error classification (retryable, splittable)
 * 5. Input validation and filtering
 * 
 * ORACLE ADAPTATIONS:
 * - Unicode-aware UTF-8 byte estimation (Oracle uses AL32UTF8)
 * - Oracle-compatible error pattern matching
 * - Timeout handling for Oracle operations
 */

import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";

// ========================================================================
// Types
// ========================================================================

/**
 * Text part of a multimodal embedding input
 */
export type MemoryEmbeddingTextPart = {
  type: "text";
  text: string;
};

/**
 * Inline data part (image, audio, etc.)
 * Oracle can store these as CLOB/BLOB
 */
export type MemoryEmbeddingInlineDataPart = {
  type: "inline-data";
  mimeType: string;
  data: string; // Base64 or other encoding
};

/**
 * Multimodal embedding input
 */
export type MemoryEmbeddingInput = {
  text: string;
  parts?: Array<MemoryEmbeddingTextPart | MemoryEmbeddingInlineDataPart>;
};

/**
 * Chunk with optional embedding input
 */
export type MemoryEmbeddingChunk = {
  text: string;
  embeddingInput?: MemoryEmbeddingInput;
};

// ========================================================================
// Token Estimation
// ========================================================================

/**
 * Estimates UTF-8 bytes for a text string.
 * 
 * ARCHITECTURE: Accurate token estimation for batch sizing.
 * Uses Buffer.byteLength for precise Oracle AL32UTF8 compatibility.
 * 
 * ORACLE SPECIFIC:
 * - Oracle uses AL32UTF8 (4-byte UTF-8)
 * - Buffer.byteLength is more accurate than simple string length
 * - Critical for Oracle's VARCHAR2/CLOB size limits
 */
function estimateUtf8Bytes(text: string): number {
  if (!text) {
    return 0;
  }
  return Buffer.byteLength(text, "utf8");
}

/**
 * Estimates total bytes for structured embedding input.
 * 
 * ORACLE ADAPTATION: 
 * - Handles both text and binary data parts
 * - Binary data (images, audio) can be large
 * - Critical for Oracle's CLOB size limits (4GB for CLOB)
 */
function estimateStructuredEmbeddingInputBytes(input: MemoryEmbeddingInput): number {
  if (!input.parts?.length) {
    return estimateUtf8Bytes(input.text);
  }
  
  let total = 0;
  for (const part of input.parts) {
    if (part.type === "text") {
      total += estimateUtf8Bytes(part.text);
    } else {
      // Binary data + metadata
      total += estimateUtf8Bytes(part.mimeType);
      total += estimateUtf8Bytes(part.data); // Base64 encoded
    }
  }
  return total;
}

// ========================================================================
// Batch Building
// ========================================================================

/**
 * Filters out empty chunks.
 * 
 * ARCHITECTURE: Prevents unnecessary embedding API calls.
 * Empty chunks waste tokens and time.
 */
export function filterNonEmptyMemoryChunks<T extends MemoryEmbeddingChunk>(chunks: T[]): T[] {
  return chunks.filter((chunk) => chunk.text.trim().length > 0);
}

/**
 * Builds batches for embedding generation.
 * 
 * ARCHITECTURE: Greedy algorithm with token limit.
 * 
 * ALGORITHM:
 * 1. Accumulate chunks until token limit exceeded
 * 2. If single chunk exceeds limit, process alone
 * 3. Start new batch when limit reached
 * 
 * ORACLE OPTIMIZATION:
 * - Batch size tuned for Oracle's array binding
 * - Reduces round trips to embedding provider
 * - Prevents Oracle CLOB size issues
 */
export function buildMemoryEmbeddingBatches<T extends MemoryEmbeddingChunk>(
  chunks: T[],
  maxTokens: number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentTokens = 0;

  for (const chunk of chunks) {
    const estimate = chunk.embeddingInput
      ? estimateStructuredEmbeddingInputBytes(chunk.embeddingInput)
      : estimateUtf8Bytes(chunk.text);
    
    const wouldExceed = current.length > 0 && currentTokens + estimate > maxTokens;
    
    if (wouldExceed) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    
    if (current.length === 0 && estimate > maxTokens) {
      // Single chunk too large - process alone
      batches.push([chunk]);
      continue;
    }
    
    current.push(chunk);
    currentTokens += estimate;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  
  return batches;
}

// ========================================================================
// Error Classification
// ========================================================================

/**
 * Retryable service errors (rate limits, 5xx, etc.)
 * 
 * ORACLE ADAPTATION:
 * - Includes Oracle-specific error patterns
 * - Matches Oracle error codes like ORA-03135 (connection lost)
 */
const RETRYABLE_MEMORY_EMBEDDING_SERVICE_ERROR_RE =
  /(rate[_ ]limit|too many requests|429|resource has been exhausted|5\d\d|cloudflare|tokens per day|ORA-\d{5}|ORA-03135|ORA-03114|ORA-24361)/i;

/**
 * Retryable transport errors (network issues)
 * 
 * ORACLE ADAPTATION:
 * - TCP/IP connection errors
 * - Oracle Net errors (TNS)
 * - Network timeouts
 */
const RETRYABLE_MEMORY_EMBEDDING_TRANSPORT_ERROR_RE =
  /(fetch failed|other side closed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|UND_ERR_|socket hang up|socket terminated|network error|read ECONN|timed out|connection (?:reset|refused|aborted|timed out)|EHOSTUNREACH|ENETUNREACH|ECONNABORTED|EAI_AGAIN|ORA-12535|ORA-12537|ORA-12541|ORA-12560)/i;

/**
 * Splittable transport errors (large payload issues)
 * 
 * ORACLE ADAPTATION:
 * - Oracle Net packet size limits
 * - CLOB size limits
 * - SQL*Net message size issues
 */
const SPLITTABLE_MEMORY_EMBEDDING_TRANSPORT_ERROR_RE =
  /(request_headers_too_large|request header fields too large|other side closed|ECONNRESET|EPIPE|UND_ERR_SOCKET|socket hang up|socket terminated|read ECONN|connection (?:reset|aborted)|ORA-22835|ORA-24345|ORA-24816|ORA-24817)/i;

// ========================================================================
// Error Checkers
// ========================================================================

/**
 * Checks if error is a retryable transport error.
 */
export function isRetryableMemoryEmbeddingTransportError(message: string): boolean {
  return RETRYABLE_MEMORY_EMBEDDING_TRANSPORT_ERROR_RE.test(message);
}

/**
 * Checks if error is splittable.
 * Used for batch splitting strategy.
 */
export function isSplittableMemoryEmbeddingTransportError(message: string): boolean {
  return SPLITTABLE_MEMORY_EMBEDDING_TRANSPORT_ERROR_RE.test(message);
}

/**
 * Checks if error is retryable (service or transport).
 */
export function isRetryableMemoryEmbeddingError(message: string): boolean {
  return (
    RETRYABLE_MEMORY_EMBEDDING_SERVICE_ERROR_RE.test(message) ||
    isRetryableMemoryEmbeddingTransportError(message)
  );
}

/**
 * Checks if error is due to payload being too large.
 * 
 * ORACLE SPECIFIC:
 * - HTTP 413 (Payload Too Large)
 * - ORA-22835 (CLOB too large)
 * - ORA-24816 (Expanded input not allowed)
 */
export function isStructuredInputTooLargeMemoryEmbeddingError(message: string): boolean {
  return /(413|payload too large|request too large|input too large|too many tokens|input limit|request size|ORA-22835|ORA-24816|ORA-24345)/i.test(
    message,
  );
}

// ========================================================================
// Retry Helpers
// ========================================================================

/**
 * Calculates retry delay with jitter.
 * 
 * ARCHITECTURE: Exponential backoff with jitter.
 * Prevents thundering herd on recovery.
 * 
 * ORACLE ADAPTATION:
 * - Works with Oracle connection retries
 * - Handles Oracle's timeout semantics
 */
export function resolveMemoryEmbeddingRetryDelay(
  delayMs: number,
  randomValue: number,
  maxDelayMs: number,
): number {
  return Math.min(maxDelayMs, Math.round(delayMs * (1 + randomValue * 0.2)));
}

/**
 * Runs embedding operation with retry loop.
 * 
 * ARCHITECTURE: Generic retry with backoff.
 * 
 * FEATURES:
 * - Exponential backoff with jitter
 * - Abort signal support
 * - Retryable error detection
 * - Configurable attempts
 * 
 * ORACLE ADAPTATION:
 * - Handles Oracle connection errors
 * - Supports Oracle statement timeout
 * - Clean abort on cancellation
 */
export async function runMemoryEmbeddingRetryLoop<T>(params: {
  run: () => Promise<T>;
  isRetryable: (message: string) => boolean;
  waitForRetry: (delayMs: number) => Promise<void>;
  maxAttempts: number;
  baseDelayMs: number;
  signal?: AbortSignal;
}): Promise<T> {
  const attempts = Math.max(1, params.maxAttempts);
  
  for (const attempt of Array.from({ length: attempts }, (_, index) => index + 1)) {
    const delayMs = params.baseDelayMs * 2 ** (attempt - 1);
    
    try {
      return await params.run();
    } catch (err) {
      // Abort signal must win over retryable errors
      if (params.signal?.aborted) {
        throw err;
      }
      
      const message = formatErrorMessage(err);
      
      if (!params.isRetryable(message) || attempt >= params.maxAttempts) {
        throw err;
      }
      
      await params.waitForRetry(delayMs);
    }
  }
  
  throw new Error("retry loop exhausted");
}

/**
 * Runs batch embedding with split strategy.
 * 
 * ARCHITECTURE: Progressive retry with splitting.
 * 
 * ALGORITHM:
 * 1. Try full batch with retry
 * 2. If fails with splittable error, split in half
 * 3. Recursively retry each half
 * 4. Merge results
 * 
 * ORACLE ADAPTATION:
 * - Handles Oracle payload size limits
 * - Works with Oracle's batch processing
 * - Optimizes for Oracle array binding
 */
export async function runMemoryEmbeddingBatchRetryWithSplit<TInput, TOutput>(params: {
  items: TInput[];
  run: (items: TInput[]) => Promise<TOutput[]>;
  isRetryable: (message: string) => boolean;
  isSplittable: (message: string) => boolean;
  waitForRetry: (delayMs: number) => Promise<void>;
  maxAttempts: number;
  baseDelayMs: number;
  onSplit?: (info: { itemCount: number; splitAt: number; message: string }) => void;
}): Promise<TOutput[]> {
  try {
    // Try full batch with retry
    return await runMemoryEmbeddingRetryLoop({
      run: async () => await params.run(params.items),
      isRetryable: params.isRetryable,
      waitForRetry: params.waitForRetry,
      maxAttempts: params.maxAttempts,
      baseDelayMs: params.baseDelayMs,
    });
  } catch (err) {
    const message = formatErrorMessage(err);
    
    // Can't split single item or not splittable
    if (params.items.length <= 1 || !params.isSplittable(message)) {
      throw err;
    }

    // Split in half and retry recursively
    const splitAt = Math.ceil(params.items.length / 2);
    params.onSplit?.({ itemCount: params.items.length, splitAt, message });
    
    const left = await runMemoryEmbeddingBatchRetryWithSplit({
      ...params,
      items: params.items.slice(0, splitAt),
    });
    
    const right = await runMemoryEmbeddingBatchRetryWithSplit({
      ...params,
      items: params.items.slice(splitAt),
    });
    
    return [...left, ...right];
  }
}

// ========================================================================
// Input Builders
// ========================================================================

/**
 * Builds embedding inputs from chunks.
 * 
 * ARCHITECTURE: Converts chunks to provider-ready format.
 * 
 * ORACLE ADAPTATION:
 * - Handles both text and multimodal inputs
 * - Compatible with Oracle AI Vector Search
 * - Supports Oracle's embedding function
 */
export function buildTextEmbeddingInputs(chunks: MemoryEmbeddingChunk[]): MemoryEmbeddingInput[] {
  return chunks.map((chunk) => chunk.embeddingInput ?? { text: chunk.text });
}

// ========================================================================
// Batch Size Optimizer
// ========================================================================

/**
 * Optimizes batch size for Oracle.
 * 
 * ORACLE SPECIFIC:
 * - Oracle's array binding limit (max 1000)
 * - Oracle's VARCHAR2 limit (4000 bytes)
 * - Oracle's CLOB limit for embeddings
 */
export function optimizeBatchSizeForOracle(
  chunks: MemoryEmbeddingChunk[],
  maxBytes: number = 32000, // Oracle VARCHAR2 limit for safety
  maxItems: number = 500,   // Oracle array binding limit
): MemoryEmbeddingChunk[][] {
  const batches: MemoryEmbeddingChunk[][] = [];
  let current: MemoryEmbeddingChunk[] = [];
  let currentBytes = 0;

  for (const chunk of chunks) {
    const bytes = chunk.embeddingInput
      ? estimateStructuredEmbeddingInputBytes(chunk.embeddingInput)
      : estimateUtf8Bytes(chunk.text);
    
    const wouldExceed = current.length > 0 && 
      (currentBytes + bytes > maxBytes || current.length + 1 > maxItems);
    
    if (wouldExceed) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    
    current.push(chunk);
    currentBytes += bytes;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

// ========================================================================
// Export
// ========================================================================

export default {
  // Batch building
  filterNonEmptyMemoryChunks,
  buildMemoryEmbeddingBatches,
  buildTextEmbeddingInputs,
  optimizeBatchSizeForOracle,
  
  // Error classification
  isRetryableMemoryEmbeddingTransportError,
  isSplittableMemoryEmbeddingTransportError,
  isRetryableMemoryEmbeddingError,
  isStructuredInputTooLargeMemoryEmbeddingError,
  
  // Retry helpers
  resolveMemoryEmbeddingRetryDelay,
  runMemoryEmbeddingRetryLoop,
  runMemoryEmbeddingBatchRetryWithSplit,
};