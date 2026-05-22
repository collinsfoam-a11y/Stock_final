const mockNetInfoFetch = jest.fn();
const mockNetInfoAddEventListener = jest.fn(() => jest.fn());

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: mockNetInfoFetch,
    addEventListener: mockNetInfoAddEventListener,
  },
  useNetInfo: jest.fn(() => ({
    isConnected: null,
    type: "unknown",
  })),
}));

jest.mock("@/services/errorRecovery", () => ({
  errorReporter: {
    report: jest.fn(),
  },
}));

describe("wifiConnectionService connectivity resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps last known connectivity when NetInfo returns unknown", async () => {
    const module = await import("../wifiConnectionService");
    const Service = module.WiFiConnectionService as any;
    Service.instance = undefined;
    const service = module.WiFiConnectionService.getInstance();

    mockNetInfoFetch
      .mockResolvedValueOnce({
        isConnected: true,
        type: "wifi",
        details: {},
      })
      .mockResolvedValueOnce({
        isConnected: null,
        type: "unknown",
        details: {},
      });

    const first = await service.checkStatus();
    const second = await service.checkStatus();

    expect(first.isConnected).toBe(true);
    expect(second.isConnected).toBe(true);
  });

  it("returns last known status when NetInfo fetch throws", async () => {
    const module = await import("../wifiConnectionService");
    const Service = module.WiFiConnectionService as any;
    Service.instance = undefined;
    const service = module.WiFiConnectionService.getInstance();

    mockNetInfoFetch
      .mockResolvedValueOnce({
        isConnected: true,
        type: "wifi",
        details: {},
      })
      .mockRejectedValueOnce(new Error("fetch failed"));

    const first = await service.checkStatus();
    const second = await service.checkStatus();

    expect(first.isConnected).toBe(true);
    expect(second.isConnected).toBe(true);
  });
});
