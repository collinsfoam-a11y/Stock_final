const mockPlatform = { OS: "web" };
const mockExpoConstants = { expoConfig: { hostUri: undefined, extra: {} } };
const mockIsValidBackendHealthResponse = jest.fn(
  async (_response?: unknown) => true,
);

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

describe("backendUrl resolution", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_BACKEND_PORT;
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    mockPlatform.OS = "web";
    mockExpoConstants.expoConfig = { hostUri: undefined, extra: {} };
    global.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          headers: { get: () => "application/json" },
          clone: () => ({ json: async () => ({ status: "healthy" }) }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    Object.defineProperty(global, "window", {
      configurable: true,
      value: {
        location: {
          origin: "https://stock-verify.example.com",
          hostname: "stock-verify.example.com",
          protocol: "https:",
        },
      },
    });
  });

  it("prefers a healthy same-origin backend on web without runtime port files", async () => {
    const backendUrl = await import("../backendUrl");

    const resolved = await backendUrl.resolveBackendUrl();

    expect(resolved).toBe("https://stock-verify.example.com");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://stock-verify.example.com/api/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(
      (global.fetch as jest.Mock).mock.calls.some((url: any) =>
        String(url).includes("backend_port.json"),
      ),
    ).toBe(false);
  });

  it("uses the configured backend port without probing legacy fallback ports", async () => {
    process.env.EXPO_PUBLIC_BACKEND_PORT = "8001";
    mockIsValidBackendHealthResponse.mockImplementation(
      async (response: any) => Boolean(response?.ok),
    );
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
    global.fetch = jest.fn(
      async (url: string) =>
        ({
          ok: url === "http://localhost:8001/api/health",
          headers: { get: () => "application/json" },
          clone: () => ({
            json: async () => ({
              status: "healthy",
              timestamp: "2026-06-03T00:00:00.000Z",
              service: "stock-verify-api",
            }),
          }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;

    const backendUrl = await import("../backendUrl");

    const resolved = await backendUrl.resolveBackendUrl();
    const probedUrls = (global.fetch as jest.Mock).mock.calls.map(([url]) =>
      String(url),
    );

    expect(resolved).toBe("http://localhost:8001");
    expect(probedUrls).toContain("http://localhost:8001/api/health");
    expect(
      probedUrls.some((url) => /:(8002|8003|8085)\/api\/health$/.test(url)),
    ).toBe(false);
  });
});
