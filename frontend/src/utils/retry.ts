import { API_MAX_RETRIES, API_RETRY_BACKOFF_MS } from "../constants/config";

interface RetryOptions {
  retries?: number;
  backoffMs?: number;
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Default retry predicate: retries on network errors and 5xx errors.
 * Does NOT retry on 4xx errors (client errors).
 */
export const defaultRetry = (error: Error): boolean => {
  const err = error as { response?: { status?: number } };
  return !(err.response?.status && err.response.status >= 400 && err.response.status < 500);
};

/**
 * Safe retry predicate for non-idempotent methods (POST, PUT, PATCH, DELETE).
 * Only retries on:
 * - Network errors (no response object)
 * - 408 Request Timeout
 * - 429 Too Many Requests
 * - 503 Service Unavailable
 * Does NOT retry on generic 5xx or 4xx errors to avoid duplicate mutations.
 */
export const safeRetry = (error: Error): boolean => {
  const err = error as { response?: { status?: number } };
  const status = err.response?.status;
  // No response = network error (timeout, DNS, connection refused)
  if (!status) return true;
  // Only retry on these specific transient statuses
  return status === 408 || status === 429 || status === 503;
};

export const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const {
    retries = API_MAX_RETRIES,
    backoffMs = API_RETRY_BACKOFF_MS,
    shouldRetry = defaultRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const err = error instanceof Error ? error : new Error(String(error));

      if (!shouldRetry(err) || attempt === retries - 1) {
        break;
      }

      const delay = backoffMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};
