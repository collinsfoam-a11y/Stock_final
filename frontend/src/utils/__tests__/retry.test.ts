/**
 * Tests for retryWithBackoff utility
 */

import { describe, it, expect, jest } from "@jest/globals";
import { retryWithBackoff } from "../retry";

describe("retryWithBackoff", () => {
  it("resolves on first attempt when operation succeeds", async () => {
    const operation = jest.fn<() => Promise<string>>().mockResolvedValue("success");

    const result = await retryWithBackoff(operation, { retries: 3, backoffMs: 0 });

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    let callCount = 0;
    const operation = jest.fn<() => Promise<string>>().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("network error");
      return "success";
    });

    const result = await retryWithBackoff(operation, { retries: 3, backoffMs: 0 });

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("throws after all retries exhausted", async () => {
    const error = new Error("persistent error");
    const operation = jest.fn<() => Promise<never>>().mockRejectedValue(error);

    await expect(
      retryWithBackoff(operation, { retries: 3, backoffMs: 0 })
    ).rejects.toThrow("persistent error");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx client errors by default", async () => {
    const error = Object.assign(new Error("Not found"), {
      response: { status: 404 },
    });
    const operation = jest.fn<() => Promise<never>>().mockRejectedValue(error);

    await expect(
      retryWithBackoff(operation, { retries: 3, backoffMs: 0 })
    ).rejects.toThrow("Not found");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx server errors", async () => {
    let callCount = 0;
    const operation = jest.fn<() => Promise<string>>().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw Object.assign(new Error("Server Error"), {
          response: { status: 500 },
        });
      }
      return "ok";
    });

    const result = await retryWithBackoff(operation, { retries: 3, backoffMs: 0 });
    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("uses custom shouldRetry predicate to block retries", async () => {
    const error = new Error("custom error");
    const operation = jest.fn<() => Promise<never>>().mockRejectedValue(error);
    const shouldRetry = jest.fn<(e: Error) => boolean>().mockReturnValue(false);

    await expect(
      retryWithBackoff(operation, { retries: 3, backoffMs: 0, shouldRetry })
    ).rejects.toThrow("custom error");

    // Only attempted once because shouldRetry returned false
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("respects custom retry count of 2", async () => {
    const operation = jest.fn<() => Promise<never>>().mockRejectedValue(
      new Error("err")
    );

    await expect(
      retryWithBackoff(operation, { retries: 2, backoffMs: 0 })
    ).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("uses custom shouldRetry to allow retry on normally-blocked status", async () => {
    let callCount = 0;
    const operation = jest.fn<() => Promise<string>>().mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        throw Object.assign(new Error("Forbidden"), {
          response: { status: 403 },
        });
      }
      return "success";
    });

    const result = await retryWithBackoff(operation, {
      retries: 3,
      backoffMs: 0,
      shouldRetry: () => true, // Always retry
    });

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
