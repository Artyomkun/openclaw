/**
 * Memory Host - Retry Utils
 */

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    delay?: number;
    maxDelay?: number;
    label?: string;
    shouldRetry?: (err: unknown) => boolean;
  } = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts || 3);
  const baseDelay = Math.max(0, options.delay || 300);
  const maxDelay = Math.max(baseDelay, options.maxDelay || 30000);
  const shouldRetry = options.shouldRetry || (() => true);

  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      if (i === attempts - 1 || !shouldRetry(err)) {
        break;
      }

      const delay = Math.min(baseDelay * Math.pow(2, i), maxDelay);
      await sleep(delay);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError || "Retry failed"));
}