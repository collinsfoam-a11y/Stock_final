import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../httpClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../offline/offlineStorage", () => ({
  addToOfflineQueue: jest.fn(),
  cacheSession: jest.fn(),
  cacheSessions: jest.fn(),
  getCountLinesBySessionFromCache: jest.fn(),
  getSessionFromCache: jest.fn(),
  getSessionsCache: jest.fn(),
  removeSessionFromCache: jest.fn(),
}));

jest.mock("../../utils/network", () => ({
  getNetworkStatus: jest.fn(),
}));

jest.mock("../../store/authStore", () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      user: null,
      isAuthenticated: false,
    })),
  },
}));

jest.mock("../logging", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock("../../utils/uuid", () => ({
  generateOfflineId: jest.fn(() => "offline_session_1"),
}));

describe("sessionManagementApi.getSession", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("removes stale cached sessions and returns null on 404", async () => {
    let httpClient: any;
    let offlineStorage: any;
    let network: any;
    let getSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getSession } = require("../api/sessionManagementApi"));
    });

    network.getNetworkStatus.mockReturnValue({
      status: "ONLINE",
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
    });
    httpClient.get.mockRejectedValue({
      response: { status: 404 },
    });
    offlineStorage.removeSessionFromCache.mockResolvedValue(undefined);

    const result = await getSession("session-404");

    expect(offlineStorage.removeSessionFromCache).toHaveBeenCalledWith(
      "session-404",
    );
    expect(result).toBeNull();
  });

  it("falls back to cached sessions for non-404 failures", async () => {
    let httpClient: any;
    let offlineStorage: any;
    let network: any;
    let getSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getSession } = require("../api/sessionManagementApi"));
    });

    network.getNetworkStatus.mockReturnValue({
      status: "ONLINE",
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
    });
    httpClient.get.mockRejectedValue({
      response: { status: 500 },
    });
    offlineStorage.getSessionFromCache.mockResolvedValue({
      id: "cached-session",
      status: "OPEN",
    });

    const result = await getSession("session-500");

    expect(offlineStorage.removeSessionFromCache).not.toHaveBeenCalled();
    expect(offlineStorage.getSessionFromCache).toHaveBeenCalledWith(
      "session-500",
    );
    expect(result).toEqual({
      id: "cached-session",
      status: "OPEN",
    });
  });
});
