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
  cacheSession: jest.fn(),
  cacheSessions: jest.fn(),
  getCountLinesBySessionFromCache: jest.fn(),
  getSessionFromCache: jest.fn(),
  getSessionsCache: jest.fn(),
  removeSessionFromCache: jest.fn(),
}));

jest.mock("../control-plane/sessionControlPlane", () => ({
  createSessionCommand: jest.fn(),
  finalizeSessionCommand: jest.fn(),
  getProjectedSessionRead: jest.fn(),
  getProjectedSessionsRead: jest.fn(),
  updateSessionStatusCommand: jest.fn(),
}));

jest.mock("../control-plane/countLineControlPlane", () => ({
  ProjectionReadError: class ProjectionReadError extends Error {
    code = "MISSING_PROJECTION";
  },
  getProjectedSessionStatsRead: jest.fn(),
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

describe("sessionManagementApi.getSession", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("removes stale cached sessions and returns null on 404", async () => {
    let httpClient: any;
    let offlineStorage: any;
    let network: any;
    let controlPlane: any;
    let getSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      controlPlane = require("../control-plane/sessionControlPlane");
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
    controlPlane.getProjectedSessionRead.mockResolvedValue(null);
    offlineStorage.removeSessionFromCache.mockResolvedValue(undefined);

    const result = await getSession("session-404");

    expect(offlineStorage.removeSessionFromCache).toHaveBeenCalledWith("session-404");
    expect(result).toBeNull();
  });

  it("falls back to cached sessions for non-404 failures", async () => {
    let httpClient: any;
    let offlineStorage: any;
    let network: any;
    let controlPlane: any;
    let getSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      controlPlane = require("../control-plane/sessionControlPlane");
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
    controlPlane.getProjectedSessionRead.mockResolvedValue(null);
    offlineStorage.getSessionFromCache.mockResolvedValue({
      id: "cached-session",
      status: "OPEN",
    });

    const result = await getSession("session-500");

    expect(offlineStorage.removeSessionFromCache).not.toHaveBeenCalled();
    expect(offlineStorage.getSessionFromCache).toHaveBeenCalledWith("session-500");
    expect(result).toEqual({
      id: "cached-session",
      status: "OPEN",
    });
  });

  it("attempts a live session read when network status is unknown", async () => {
    let httpClient: any;
    let network: any;
    let controlPlane: any;
    let getSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      controlPlane = require("../control-plane/sessionControlPlane");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getSession } = require("../api/sessionManagementApi"));
    });

    network.getNetworkStatus.mockReturnValue({
      status: "UNKNOWN",
      isOnline: true,
      isInternetReachable: null,
      connectionType: "wifi",
    });
    httpClient.get.mockResolvedValue({
      data: {
        id: "session-unknown",
        status: "OPEN",
      },
    });
    controlPlane.getProjectedSessionRead.mockResolvedValue(null);

    const result = await getSession("session-unknown");

    expect(httpClient.get).toHaveBeenCalledWith("/api/sessions/session-unknown");
    expect(result).toEqual({
      id: "session-unknown",
      status: "OPEN",
    });
  });

  it("loads live session detail when projected session storage is unavailable", async () => {
    let httpClient: any;
    let network: any;
    let controlPlane: any;
    let getSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      controlPlane = require("../control-plane/sessionControlPlane");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getSession } = require("../api/sessionManagementApi"));
    });

    network.getNetworkStatus.mockReturnValue({
      status: "ONLINE",
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
    });
    controlPlane.getProjectedSessionRead.mockRejectedValue(
      new Error("navigator.storage not available")
    );
    httpClient.get.mockResolvedValue({
      data: {
        id: "session-live",
        status: "OPEN",
        warehouse: "Showroom - Ground - A1",
      },
    });

    const result = await getSession("session-live");

    expect(httpClient.get).toHaveBeenCalledWith("/api/sessions/session-live");
    expect(result).toEqual({
      id: "session-live",
      status: "OPEN",
      warehouse: "Showroom - Ground - A1",
    });
  });

  it("loads live session stats when projected stats storage is unavailable", async () => {
    let httpClient: any;
    let network: any;
    let countLineControlPlane: any;
    let getSessionStats: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      countLineControlPlane = require("../control-plane/countLineControlPlane");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getSessionStats } = require("../api/sessionManagementApi"));
    });

    network.getNetworkStatus.mockReturnValue({
      status: "ONLINE",
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
    });
    countLineControlPlane.getProjectedSessionStatsRead.mockRejectedValue(
      new Error("Invalid VFS state")
    );
    httpClient.get.mockResolvedValue({
      data: {
        id: "session-live",
        total_items: 12,
        verified_items: 4,
        pending_items: 3,
        damage_items: 1,
        duration_seconds: 60,
        items_per_minute: 7,
      },
    });

    const result = await getSessionStats("session-live");

    expect(httpClient.get).toHaveBeenCalledWith("/api/sessions/session-live/stats");
    expect(result).toEqual({
      id: "session-live",
      totalItems: 12,
      scannedItems: 7,
      verifiedItems: 4,
      pendingItems: 3,
      damageItems: 1,
      durationSeconds: 60,
      itemsPerMinute: 7,
    });
  });

  it("creates and queues an offline session when offline", async () => {
    let controlPlane: any;
    let offlineStorage: any;
    let network: any;
    let createSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      controlPlane = require("../control-plane/sessionControlPlane");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ createSession } = require("../api/sessionManagementApi"));
    });

    network.getNetworkStatus.mockReturnValue({
      status: "OFFLINE",
      isOnline: false,
      isInternetReachable: false,
      connectionType: "none",
    });
    controlPlane.createSessionCommand.mockResolvedValue({
      id: "offline_session_1",
      warehouse: "WH-OFFLINE",
      status: "OPEN",
      type: "STANDARD",
      staff_user: "offline_user",
      staff_name: "Offline User",
      started_at: new Date().toISOString(),
      total_items: 0,
      total_variance: 0,
      _createdOffline: true,
      _source: "local",
    });
    offlineStorage.cacheSession.mockResolvedValue(undefined);

    const result = await createSession("WH-OFFLINE");

    expect(result.id).toBe("offline_session_1");
    expect(result._createdOffline).toBe(true);
    expect(controlPlane.createSessionCommand).toHaveBeenCalledWith({
      warehouse: "WH-OFFLINE",
      type: undefined,
      location_type: undefined,
      location_name: undefined,
      rack_no: undefined,
    });
    expect(offlineStorage.cacheSession).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse: "WH-OFFLINE" })
    );
  });

  it("merges visible cached sessions into API results", async () => {
    let authStore: any;
    let httpClient: any;
    let offlineStorage: any;
    let network: any;
    let controlPlane: any;
    let getSessions: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      authStore = require("../../store/authStore");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      controlPlane = require("../control-plane/sessionControlPlane");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getSessions } = require("../api/sessionManagementApi"));
    });

    authStore.useAuthStore.getState.mockReturnValue({
      user: { username: "staff1", role: "staff" },
      isAuthenticated: true,
    });
    network.getNetworkStatus.mockReturnValue({
      status: "ONLINE",
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
    });
    httpClient.get.mockResolvedValue({
      data: {
        items: [{ id: "session-api", staff_user: "staff1", status: "OPEN" }],
        pagination: {
          page: 1,
          page_size: 20,
          total: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      },
    });
    offlineStorage.getSessionsCache.mockResolvedValue({
      "session-api": { id: "session-api", staff_user: "staff1", status: "OPEN" },
      "session-cache": { id: "session-cache", staff_user: "staff1", status: "OPEN" },
      "session-other": { id: "session-other", staff_user: "staff2", status: "OPEN" },
    });
    offlineStorage.cacheSessions.mockResolvedValue(undefined);
    controlPlane.getProjectedSessionsRead.mockResolvedValue([]);

    const result = await getSessions(1, 20);

    expect(result.items.map((item: any) => item.id)).toEqual(["session-api", "session-cache"]);
  });

  it("keeps API sessions visible when projected session storage is unavailable", async () => {
    let authStore: any;
    let httpClient: any;
    let offlineStorage: any;
    let network: any;
    let controlPlane: any;
    let getSessions: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      authStore = require("../../store/authStore");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      controlPlane = require("../control-plane/sessionControlPlane");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getSessions } = require("../api/sessionManagementApi"));
    });

    authStore.useAuthStore.getState.mockReturnValue({
      user: { username: "staff1", role: "staff" },
      isAuthenticated: true,
    });
    network.getNetworkStatus.mockReturnValue({
      status: "ONLINE",
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
    });
    httpClient.get.mockResolvedValue({
      data: {
        items: [{ id: "session-api", staff_user: "staff1", status: "OPEN" }],
        pagination: {
          page: 1,
          page_size: 20,
          total: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      },
    });
    offlineStorage.cacheSessions.mockResolvedValue(undefined);
    offlineStorage.getSessionsCache.mockResolvedValue({});
    controlPlane.getProjectedSessionsRead.mockRejectedValue(
      new Error("navigator.storage not available")
    );

    const result = await getSessions(1, 20);

    expect(result.items).toEqual([{ id: "session-api", staff_user: "staff1", status: "OPEN" }]);
    expect(httpClient.get).toHaveBeenCalledWith("/api/sessions", {
      params: {
        page: 1,
        page_size: 20,
      },
    });
  });

  it("returns an empty offline page when local session storage is unavailable", async () => {
    let offlineStorage: any;
    let network: any;
    let controlPlane: any;
    let getSessions: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      controlPlane = require("../control-plane/sessionControlPlane");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ getSessions } = require("../api/sessionManagementApi"));
    });

    network.getNetworkStatus.mockReturnValue({
      status: "OFFLINE",
      isOnline: false,
      isInternetReachable: false,
      connectionType: "none",
    });
    controlPlane.getProjectedSessionsRead.mockRejectedValue(new Error("Invalid VFS state"));
    offlineStorage.getSessionsCache.mockRejectedValue(new Error("cache unavailable"));

    const result = await getSessions(1, 20);

    expect(result).toEqual({
      items: [],
      pagination: {
        page: 1,
        page_size: 20,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_prev: false,
      },
    });
  });
});
