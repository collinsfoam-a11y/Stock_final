import { initAuthAndSettings } from "./initAuthAndSettings";

describe("initAuthAndSettings", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns fulfilled results when both loaders succeed", async () => {
    const result = await initAuthAndSettings(
      async () => undefined,
      async () => undefined,
    );

    expect(result.authResult.status).toBe("fulfilled");
    expect(result.settingsResult.status).toBe("fulfilled");
  });

  it("marks loaders as rejected on timeout", async () => {
    const never = () => new Promise<void>(() => {});
    const pending = initAuthAndSettings(never, never);

    const advance = async (ms: number) => {
      const advanceAsync = (jest as any).advanceTimersByTimeAsync as
        | ((time: number) => Promise<void>)
        | undefined;

      if (typeof advanceAsync === "function") {
        await advanceAsync(ms);
        return;
      }

      jest.advanceTimersByTime(ms);
      // Flush microtasks/promises triggered by timer callbacks.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
    };

    await advance(3000);
    // Settings initialization starts after auth has settled.
    await advance(3000);
    const result = await pending;

    expect(result.authResult.status).toBe("rejected");
    expect(result.settingsResult.status).toBe("rejected");
  });
});
