import { jest } from "@jest/globals";

const mockPlatform = { OS: "web" };
const mockExpoConstants = { expoConfig: { hostUri: undefined, extra: {} } };
const mockIsValidBackendHealthResponse = jest.fn(async () => true);

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
    expect((global.fetch as jest.Mock).mock.calls.some(([url]) =>
      String(url).includes("backend_port.json"))).toBe(false);
  });
});
