const mockPlatform = { OS: "web" };
const mockExpoConstants: {
  expoConfig: { hostUri?: string; extra: Record<string, unknown> };
} = { expoConfig: { hostUri: undefined, extra: {} } };
const mockIsValidBackendHealthResponse = jest.fn(
  async (_response?: Response) => true,
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
    mockIsValidBackendHealthResponse.mockImplementation(async () => true);
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

  it("probes port 8000 from the Expo host when port 8001 is unavailable", async () => {
    mockPlatform.OS = "ios";
    mockExpoConstants.expoConfig = {
      hostUri: "192.168.1.50:8081",
      extra: {},
    };
    Object.defineProperty(global, "window", {
      configurable: true,
      value: undefined,
    });
    mockIsValidBackendHealthResponse.mockImplementation(
      async (response?: Response) => (response as { ok?: boolean } | undefined)?.ok === true,
    );
    global.fetch = jest.fn(async (url) => {
      const requestUrl = String(url);
      return {
        ok: requestUrl === "http://192.168.1.50:8000/api/health",
        headers: { get: () => "application/json" },
        clone: () => ({ json: async () => ({ status: "healthy" }) }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const backendUrl = await import("../backendUrl");

    const resolved = await backendUrl.resolveBackendUrl();

    expect(resolved).toBe("http://192.168.1.50:8000");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.50:8001/api/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.50:8000/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
