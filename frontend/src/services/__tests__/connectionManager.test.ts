const mockPlatform = { OS: "web" };
const mockExpoConstants: {
  expoConfig: { hostUri?: string; extra: Record<string, unknown> };
} = { expoConfig: { hostUri: undefined, extra: {} } };

const mockIsValidBackendHealthResponse = jest.fn(
  async (response?: Response) => (response as { ok?: boolean } | undefined)?.ok === true,
);

jest.unmock("../connectionManager");

jest.mock("react-native", () => ({
  Platform: mockPlatform,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: mockExpoConstants,
}));

jest.mock("../healthRequest", () => ({
  isValidBackendHealthResponse: mockIsValidBackendHealthResponse,
}));

jest.mock("../connectionMonitoring", () => ({
  shouldMonitorConnectionHealth: jest.fn(() => false),
}));

describe("ConnectionManager candidate ordering", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockPlatform.OS = "web";
    mockExpoConstants.expoConfig = { hostUri: undefined, extra: {} };
    Object.defineProperty(global, "window", {
      configurable: true,
      value: {
        location: {
          origin: "http://localhost:8081",
          hostname: "localhost",
          protocol: "http:",
        },
      },
    });

    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.clear();
    await AsyncStorage.setItem(
      "connection_info",
      JSON.stringify({
        backendUrl: "http://localhost:8001",
        backendPort: 8001,
        backendIp: "localhost",
        lastChecked: "2026-05-22T11:44:07.943Z",
        isHealthy: true,
      }),
    );
  });

  it("tries the saved healthy backend before lower-priority fallback ports", async () => {
    global.fetch = jest.fn(async (url) => {
      const requestUrl = String(url);
      return {
        ok: requestUrl === "http://localhost:8001/api/health",
        headers: { get: () => "application/json" },
        clone: () => ({ json: async () => ({ status: "healthy" }) }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const { default: ConnectionManager } = jest.requireActual("../connectionManager");
    const manager = ConnectionManager.getInstance();

    await manager.initialize();
    manager.stopHealthMonitoring();

    const checkedUrls = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));
    expect(checkedUrls).toEqual([
      "http://localhost:8081/api/health",
      "http://localhost:8001/api/health",
    ]);
  });
});
