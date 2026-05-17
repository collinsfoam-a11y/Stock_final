import { API_MAX_RETRIES, API_RETRY_BACKOFF_MS } from "../constants/config";

interface RetryOptions {
  retries?: number;
  backoffMs?: number;
  shouldRetry?: (error: Error) => boolean;
}

export const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const {
    retries = API_MAX_RETRIES,
    backoffMs = API_RETRY_BACKOFF_MS,
    shouldRetry = (error: Error) => {
      const err = error as { response?: { status?: number } };
      return !(err.response?.status && err.response.status >= 400 && err.response.status < 500);
    },
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
