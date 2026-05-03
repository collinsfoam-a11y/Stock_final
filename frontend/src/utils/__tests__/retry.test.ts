import {
  PROJECTION_NOT_READY_BLOCKING_MESSAGE,
  retryWithBackoff,
} from "../retry";

const flushMicrotasks = async () => {
  await Promise.resolve();
};

describe("retryWithBackoff", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("retries projection readiness failures with exponential backoff then blocks", async () => {
    const error = Object.assign(new Error("projection stale"), {
      response: {
        status: 503,
        data: { detail: { code: "PROJECTION_INCONSISTENT" } },
      },
    });
    const operation = jest.fn().mockRejectedValue(error);

    const result = retryWithBackoff(operation, {
      retries: 4,
      backoffMs: 1000,
      maxBackoffMs: 30000,
    });

    await flushMicrotasks();
    expect(operation).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(operation).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(2000);
    await flushMicrotasks();
    expect(operation).toHaveBeenCalledTimes(3);

    jest.advanceTimersByTime(4000);
    await flushMicrotasks();
    await expect(result).rejects.toThrow(PROJECTION_NOT_READY_BLOCKING_MESSAGE);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it("caps retry delay at the configured maximum", async () => {
    const operation = jest.fn().mockRejectedValue(new Error("network down"));
    const result = retryWithBackoff(operation, {
      retries: 3,
      backoffMs: 20000,
      maxBackoffMs: 30000,
    });

    await flushMicrotasks();
    jest.advanceTimersByTime(20000);
    await flushMicrotasks();
    jest.advanceTimersByTime(30000);
    await flushMicrotasks();

    await expect(result).rejects.toThrow("network down");
    expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 20000);
    expect(setTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 30000);
  });
});
