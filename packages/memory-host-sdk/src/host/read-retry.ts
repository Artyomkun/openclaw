/**
 * Memory Host - Read Retry
 */

import { retryAsync } from "./retry-utils.js";

const TRANSIENT_CODES = new Set(["EAGAIN", "EWOULDBLOCK", "EDEADLK"]);

function isTransientError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException;
  return !!(err?.code && TRANSIENT_CODES.has(err.code)) ||
          err?.errno === -11 ||
          (err?.message && /Unknown system error -11\b/i.test(err.message));
}

export async function retryTransientMemoryRead<T>(
  read: () => Promise<T>,
  label = "memory read",
): Promise<T> {
  return await retryAsync(read, {
    attempts: 3,
    minDelayMs: 25,
    maxDelayMs: 50,
    label,
    shouldRetry: isTransientError,
  });
}