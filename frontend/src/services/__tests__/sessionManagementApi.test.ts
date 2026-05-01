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
  generateUUID: jest.fn(() => "00000000-0000-4000-8000-000000000001"),
}));

const installLocalStorageMock = () => {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
    }),
    clear: jest.fn(() => {
      store.clear();
    }),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
  return localStorageMock;
};

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

  it("attempts a live session read when network status is unknown", async () => {
    let httpClient: any;
    let network: any;
    let getSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
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

    const result = await getSession("session-unknown");

    expect(httpClient.get).toHaveBeenCalledWith("/api/sessions/session-unknown");
    expect(result).toEqual({
      id: "session-unknown",
      status: "OPEN",
    });
  });

  it("creates and queues an offline session when offline", async () => {
    let offlineStorage: any;
    let network: any;
    let createSession: any;

    jest.isolateModules(() => {
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
    offlineStorage.cacheSession.mockResolvedValue(undefined);
    offlineStorage.addToOfflineQueue.mockResolvedValue(undefined);

    const result = await createSession("WH-OFFLINE");

    expect(result.id).toBeTruthy();
    expect(result.client_session_id).toBe(result.id);
    expect(result._createdOffline).toBe(true);
    expect(offlineStorage.cacheSession).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse: "WH-OFFLINE" }),
    );
    expect(offlineStorage.addToOfflineQueue).toHaveBeenCalledWith(
      "session",
      expect.objectContaining({
        client_session_id: result.id,
        warehouse: "WH-OFFLINE",
      }),
    );
  });

  it("rotates client session identity after offline fallback and uses a fresh id on retry", async () => {
    const localStorageMock = installLocalStorageMock();
    let httpClient: any;
    let offlineStorage: any;
    let network: any;
    let createSession: any;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      httpClient = require("../httpClient").default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      offlineStorage = require("../offline/offlineStorage");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      network = require("../../utils/network");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ createSession } = require("../api/sessionManagementApi"));
    });

    network.getNetworkStatus.mockReturnValue({
      status: "ONLINE",
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
    });
    offlineStorage.cacheSession.mockResolvedValue(undefined);
    offlineStorage.addToOfflineQueue.mockResolvedValue(undefined);
    httpClient.post
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({
        data: {
          id: "server-session",
          warehouse: "WH-ONLINE",
          staff_user: "staff1",
          staff_name: "Staff User",
          status: "OPEN",
          type: "STANDARD",
          started_at: "2026-04-30T00:00:00Z",
        },
      });

    await createSession("WH-ONLINE");
    await createSession("WH-ONLINE");

    const firstClientSessionId = localStorageMock.setItem.mock.calls[0]?.[1];
    const secondClientSessionId = localStorageMock.setItem.mock.calls[1]?.[1];
    expect(firstClientSessionId).toBeTruthy();
    expect(secondClientSessionId).toBeTruthy();
    expect(secondClientSessionId).not.toBe(firstClientSessionId);
    expect(localStorageMock.setItem.mock.invocationCallOrder[0]).toBeLessThan(
      httpClient.post.mock.invocationCallOrder[0],
    );
    expect(localStorageMock.setItem.mock.invocationCallOrder[1]).toBeLessThan(
      httpClient.post.mock.invocationCallOrder[1],
    );
    expect(httpClient.post.mock.calls[0][1].client_session_id).toBe(firstClientSessionId);
    expect(httpClient.post.mock.calls[1][1].client_session_id).toBe(secondClientSessionId);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("client_session_id");
  });

  it("merges visible cached sessions into API results", async () => {
    let authStore: any;
    let httpClient: any;
    let offlineStorage: any;
    let network: any;
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

    const result = await getSessions(1, 20);

    expect(result.items.map((item: any) => item.id)).toEqual([
      "session-api",
      "session-cache",
    ]);
  });
});
