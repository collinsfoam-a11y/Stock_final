/**
 * errorHandler.test.ts
 *
 * Unit tests for ErrorHandler.handleApiError and RetryHandler.retry.
 *
 * ErrorHandler depends on:
 *   - react-native Alert (mocked globally below)
 *   - @/services/logging (mocked globally below)
 *
 * No network calls are made.
 */

// ---------------------------------------------------------------------------
// Module-level mocks (applied before any import of the module under test)
// ---------------------------------------------------------------------------
jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
}));

jest.mock("@/services/logging", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ErrorHandler, RetryHandler } = require("./errorHandler");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake Axios-style response error */
const responseError = (
  status: number,
  data: Record<string, unknown> = {},
): object => ({
  response: { status, data },
  request: {},
  message: `Request failed with status code ${status}`,
});

/** Build a fake network (no-response) error */
const networkError = (code?: string): object => ({
  request: {},
  code,
  message: code === "ECONNABORTED" ? "timeout of 5000ms exceeded" : "Network Error",
});

/** Build a setup error (no request, no response — e.g. bad config) */
const setupError = (message: string): object => ({
  message,
});

// ---------------------------------------------------------------------------

describe("ErrorHandler.handleApiError — HTTP response errors", () => {
  // Helper: build error with null data so applyStatusFallback is used
  // (non-null objects are treated as structured even when empty, per the implementation)
  const statusError = (status: number) => ({ response: { status, data: null }, request: {} });

  it("returns correct shape for 401 Unauthorized", () => {
    const result = ErrorHandler.handleApiError(statusError(401), "test");

    expect(result.statusCode).toBe(401);
    expect(result.code).toBe("AUTH_003");
    expect(result.category).toBe("authentication");
    expect(result.message).toBeTruthy();
  });

  it("returns correct shape for 403 Forbidden", () => {
    const result = ErrorHandler.handleApiError(statusError(403), "test");

    expect(result.statusCode).toBe(403);
    expect(result.code).toBe("AUTHZ_001");
    expect(result.category).toBe("authorization");
  });

  it("returns correct shape for 404 Not Found", () => {
    const result = ErrorHandler.handleApiError(statusError(404), "test");

    expect(result.statusCode).toBe(404);
    expect(result.code).toBe("RES_001");
    expect(result.category).toBe("resource");
  });

  it("returns correct shape for 500 Internal Server Error", () => {
    const result = ErrorHandler.handleApiError(statusError(500), "test");

    expect(result.statusCode).toBe(500);
    expect(result.code).toBe("SRV_001");
    expect(result.category).toBe("server");
  });

  it("uses structured server payload when present", () => {
    const error = responseError(400, {
      message: "Custom server message",
      detail: "Additional detail",
      code: "CUSTOM_CODE",
      category: "validation",
    });

    const result = ErrorHandler.handleApiError(error);

    expect(result.message).toBe("Custom server message");
    expect(result.detail).toBe("Additional detail");
    expect(result.code).toBe("CUSTOM_CODE");
  });

  it("falls back to status-table values when data is null/undefined", () => {
    // When the response body is not an object, applyStructuredServerError returns false
    // and applyStatusFallback is used.
    const error = { response: { status: 422, data: null }, request: {} };
    const result = ErrorHandler.handleApiError(error);

    expect(result.statusCode).toBe(422);
    expect(result.code).toBe("VAL_002");
    expect(result.category).toBe("validation");
  });

  it("handles string response data gracefully", () => {
    const error = { response: { status: 503, data: "Service Unavailable" }, request: {} };

    const result = ErrorHandler.handleApiError(error);

    expect(result.statusCode).toBe(503);
    expect(result.message).toBe("Service Unavailable");
  });
});

// ---------------------------------------------------------------------------

describe("ErrorHandler.handleApiError — network / no-response errors", () => {
  it("returns NET_002 when there is no response (connection refused)", () => {
    const error = {
      request: {},
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED 127.0.0.1:8000",
    };

    const result = ErrorHandler.handleApiError(error, "test");

    expect(result.statusCode).toBe(0);
    expect(result.code).toBe("NET_002");
    expect(result.category).toBe("network");
  });

  it("returns NET_001 for timeout (ECONNABORTED)", () => {
    const result = ErrorHandler.handleApiError(networkError("ECONNABORTED"), "test");

    expect(result.statusCode).toBe(0);
    expect(result.code).toBe("NET_001");
    expect(result.category).toBe("network");
    expect(result.message).toMatch(/timeout/i);
  });

  it("returns generic NET_001 for unknown network error", () => {
    // no code, no response — falls through to generic network branch
    const error = { request: {}, message: "Network Error" };

    const result = ErrorHandler.handleApiError(error);

    expect(result.statusCode).toBe(0);
    expect(result.category).toBe("network");
  });
});

// ---------------------------------------------------------------------------

describe("ErrorHandler.handleApiError — setup / config errors", () => {
  it("returns UNK_001 for a setup error with a message", () => {
    const result = ErrorHandler.handleApiError(setupError("Bad config"));

    expect(result.message).toBe("Bad config");
    // Setup errors don't have a statusCode override; default is 500
    expect(result.code).toBe("UNK_001");
  });

  it("falls back gracefully when error has no message", () => {
    const result = ErrorHandler.handleApiError({});

    expect(result.message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe("RetryHandler.retry — retry logic", () => {
  // Use real timers; pass delayMs=0 to avoid slow tests.

  it("returns immediately on first success, calling the function once", async () => {
    const operation = jest.fn(async () => "ok");

    const result = await RetryHandler.retry(operation, 3, 0);

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries until success and returns the result", async () => {
    let attempt = 0;
    const operation = jest.fn(async () => {
      attempt++;
      if (attempt < 3) throw new Error("transient");
      return "success";
    });

    const result = await RetryHandler.retry(operation, 3, 0);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retries", async () => {
    const operation = jest.fn(async () => {
      throw new Error("always fails");
    });

    await expect(RetryHandler.retry(operation, 3, 0)).rejects.toThrow("always fails");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("calls the operation exactly maxRetries times on total failure", async () => {
    const operation = jest.fn(async () => {
      throw new Error("fail");
    });

    await expect(RetryHandler.retry(operation, 5, 0)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(5);
  });

  it("uses default maxRetries=3 when not specified", async () => {
    const operation = jest.fn(async () => {
      throw new Error("fail");
    });

    await expect(RetryHandler.retry(operation, undefined, 0)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
