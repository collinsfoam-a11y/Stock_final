import { safeAsync } from "../safeRender";

describe("safeAsync", () => {
  let originalDev: unknown;

  beforeEach(() => {
    originalDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = true;
  });

  afterEach(() => {
    (globalThis as any).__DEV__ = originalDev;
    jest.restoreAllMocks();
  });

  it("returns fallback and suppresses dev error logging for handled request errors", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handledError = Object.assign(new Error("Request failed with status code 404"), {
      isAxiosError: true,
      response: { status: 404 },
    });
    const onError = jest.fn();
    const fallback = { value: "fallback" };

    const result = await safeAsync(
      async () => {
        throw handledError;
      },
      fallback,
      onError,
    );

    expect(result).toBe(fallback);
    expect(onError).toHaveBeenCalledWith(handledError);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("logs non-request errors in dev mode", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failure = new Error("boom");

    await safeAsync(async () => {
      throw failure;
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith("Safe async error:", failure);
  });
});
