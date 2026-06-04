import { shouldMonitorConnectionHealth } from "../connectionMonitoring";

describe("shouldMonitorConnectionHealth", () => {
  it("skips health polling for same-origin web connections", () => {
    expect(
      shouldMonitorConnectionHealth(
        { backendUrl: "http://localhost:8081/" },
        "web",
        "http://localhost:8081",
      ),
    ).toBe(false);
  });

  it("keeps health polling for non same-origin web backends", () => {
    expect(
      shouldMonitorConnectionHealth(
        { backendUrl: "http://127.0.0.1:8001" },
        "web",
        "http://localhost:8081",
      ),
    ).toBe(true);
  });

  it("keeps health polling outside web", () => {
    expect(
      shouldMonitorConnectionHealth(
        { backendUrl: "http://10.0.2.2:8001" },
        "android",
        null,
      ),
    ).toBe(true);
  });
});

describe("ConnectionManager backend detection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.unmock("@/services/connectionManager");
    jest.unmock("../connectionManager");
    jest.useFakeTimers();
    process.env = { ...originalEnv, EXPO_PUBLIC_BACKEND_PORT: "8001" };

    Object.defineProperty(global, "window", {
      configurable: true,
      value: {
        location: {
          origin: "http://localhost:8082",
          hostname: "localhost",
          protocol: "http:",
        },
      },
    });

    jest.doMock("react-native", () => ({
      Platform: { OS: "web" },
    }));
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: { expoConfig: { hostUri: undefined, extra: {} } },
    }));
    jest.doMock("@react-native-async-storage/async-storage", () => ({
      __esModule: true,
      default: {
        getItem: jest.fn(async () =>
          JSON.stringify({
            backendUrl: "http://localhost:8002",
            backendPort: 8002,
            backendIp: "localhost",
            lastChecked: "2026-06-03T00:00:00.000Z",
            isHealthy: false,
          }),
        ),
        setItem: jest.fn(async () => undefined),
      },
    }));
    jest.doMock("../healthRequest", () => ({
      isValidBackendHealthResponse: jest.fn(async (response: any) =>
        Boolean(response?.healthy),
      ),
    }));
    jest.doMock("../logging", () => ({
      createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    }));

    global.fetch = jest.fn(async (url: string) => ({
      healthy: url === "http://localhost:8001/api/health",
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
    jest.resetModules();
    jest.dontMock("react-native");
    jest.dontMock("expo-constants");
    jest.dontMock("../healthRequest");
    jest.dontMock("../logging");
  });

  it("ignores stale saved ports and legacy fallback ports when a backend port is configured", async () => {
    const connectionManagerModule = await import("../connectionManager");
    const ConnectionManager =
      (connectionManagerModule.default as any)?.default ??
      connectionManagerModule.default;
    const manager = ConnectionManager.getInstance();

    await manager.initialize();
    manager.stopHealthMonitoring();

    const probedUrls = (global.fetch as jest.Mock).mock.calls.map(([url]) =>
      String(url),
    );

    expect(manager.getConnection()?.backendUrl).toBe("http://localhost:8001");
    expect(probedUrls).toContain("http://localhost:8001/api/health");
    expect(
      probedUrls.some((url) => /:(8002|8003|8085)\/api\/health$/.test(url)),
    ).toBe(false);
  });
});
