const mockFetch = jest.fn();
const mockAddEventListener = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: mockFetch,
    addEventListener: mockAddEventListener,
  },
}));

const mockStore = {
  isOnline: true,
  isInternetReachable: true as boolean | null,
  connectionType: "wifi",
  setIsOnline: jest.fn((value: boolean) => {
    mockStore.isOnline = value;
  }),
  setConnectionType: jest.fn((value: string) => {
    mockStore.connectionType = value;
  }),
  setIsInternetReachable: jest.fn((value: boolean | null) => {
    mockStore.isInternetReachable = value;
  }),
  setRestrictedMode: jest.fn(),
};

jest.mock("../../store/networkStore", () => ({
  useNetworkStore: {
    getState: jest.fn(() => mockStore),
  },
}));

describe("networkService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.isOnline = true;
    mockStore.isInternetReachable = true;
    mockStore.connectionType = "wifi";
    mockFetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: "wifi",
    });
  });

  it("does not force offline when NetInfo connectivity is unknown", async () => {
    const { initializeNetworkListener } = await import("../networkService");

    initializeNetworkListener();

    const listener = mockAddEventListener.mock.calls[0]?.[0];
    expect(typeof listener).toBe("function");

    listener({
      isConnected: null,
      isInternetReachable: null,
      type: "unknown",
    });

    expect(mockStore.setIsOnline).not.toHaveBeenCalledWith(false);
    expect(mockStore.setIsInternetReachable).not.toHaveBeenCalledWith(null);
  });

  it("marks offline when connectivity is explicitly false", async () => {
    const { initializeNetworkListener } = await import("../networkService");

    initializeNetworkListener();

    const listener = mockAddEventListener.mock.calls[0]?.[0];
    expect(typeof listener).toBe("function");

    listener({
      isConnected: false,
      isInternetReachable: false,
      type: "none",
    });

    expect(mockStore.setIsOnline).toHaveBeenCalledWith(false);
    expect(mockStore.setIsInternetReachable).toHaveBeenCalledWith(null);
  });

  it("keeps LAN mode usable when internet is unreachable", async () => {
    const { initializeNetworkListener } = await import("../networkService");

    initializeNetworkListener();

    const listener = mockAddEventListener.mock.calls[0]?.[0];
    expect(typeof listener).toBe("function");

    listener({
      isConnected: true,
      isInternetReachable: false,
      type: "wifi",
    });

    expect(mockStore.setIsOnline).toHaveBeenCalledWith(true);
    expect(mockStore.setIsInternetReachable).toHaveBeenCalledWith(null);
  });
});
