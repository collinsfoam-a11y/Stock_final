import { withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves when the promise completes before timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "timeout")).resolves.toBe("ok");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("rejects with timeout message when promise does not complete in time", async () => {
    const pending = new Promise<never>(() => {});
    const timed = withTimeout(pending, 1000, "timeout");

    jest.advanceTimersByTime(1000);
    await expect(timed).rejects.toThrow("timeout");
    expect(jest.getTimerCount()).toBe(0);
  });
});
