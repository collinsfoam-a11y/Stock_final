import { describe, it, expect, beforeEach, jest } from "@jest/globals";

describe("sentry service smoke tests", () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_APP_ENV;
    const fetchMock: jest.Mock = jest.fn();
    fetchMock.mockImplementation(async () => ({ ok: true }));
    (globalThis as any).fetch = fetchMock;
  });

  it("does not send events when DSN is missing", async () => {
    const sentry = await import("../sentry");

    sentry.captureException(new Error("no-dsn-error"), { context: "smoke-no-dsn" });
    await Promise.resolve();

    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it("sends one envelope event when DSN is configured", async () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://public@o1.ingest.sentry.io/12345";
    process.env.EXPO_PUBLIC_APP_ENV = "test";

    const sentry = await import("../sentry");
    const error = new Error("configured-dsn-error");

    sentry.captureException(error, { context: "smoke-with-dsn", feature: "sentry" });
    await Promise.resolve();
    await Promise.resolve();

    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (globalThis as any).fetch.mock.calls[0];
    expect(url).toBe("https://o1.ingest.sentry.io/api/12345/envelope/");
    expect(request?.method).toBe("POST");
    expect(request?.headers?.["Content-Type"]).toBe("application/x-sentry-envelope");
    expect(String(request?.body || "")).toContain("configured-dsn-error");
    expect(String(request?.body || "")).toContain("smoke-with-dsn");
  });
});
