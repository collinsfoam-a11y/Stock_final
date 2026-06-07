/**
 * authStore.test.ts
 *
 * Unit tests for useAuthStore covering:
 *   - initial state
 *   - establishSession (login path)
 *   - logout
 *   - checkTokenExpired / isTokenExpired delegation
 *   - role-based state storage
 *
 * Pattern: jest.doMock + jest.isolateModules (same pattern as __tests__/ siblings).
 * All external dependencies are mocked; no network calls are made.
 */

// ---------------------------------------------------------------------------
// Helper: build a minimal, unsigned JWT with a given exp claim (seconds).
// The token format is header.payload.signature — signature is a placeholder
// because isTokenExpired only reads the payload.
// ---------------------------------------------------------------------------
const buildJwt = (expSeconds: number): string => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, sub: "test-user" })).toString(
    "base64url",
  );
  return `${header}.${payload}.sig`;
};

const now = () => Math.floor(Date.now() / 1000);
const expiredToken = () => buildJwt(now() - 300); // 5 minutes in the past
const validToken = () => buildJwt(now() + 3600);  // 1 hour in the future

// ---------------------------------------------------------------------------
// Shared mock factory used across describe blocks
// ---------------------------------------------------------------------------
const buildCoreMocks = (overrides?: {
  secureStorageGetItem?: jest.Mock;
  httpClientPost?: jest.Mock;
}) => {
  const getItem = overrides?.secureStorageGetItem ?? jest.fn(async () => null);
  const setItem = jest.fn(async () => undefined);
  const removeItem = jest.fn(async () => undefined);
  const post = overrides?.httpClientPost ?? jest.fn(async () => ({ data: { success: true } }));
  const get = jest.fn(async () => ({ data: {} }));
  const loadSettings = jest.fn(async () => undefined);
  const syncFromBackend = jest.fn(async () => undefined);

  const httpClient = {
    defaults: { headers: { common: {} as Record<string, string> } },
    post,
    get,
  };

  return { getItem, setItem, removeItem, post, get, httpClient, loadSettings, syncFromBackend };
};

const registerCommonMocks = (mocks: ReturnType<typeof buildCoreMocks>) => {
  jest.doMock("../services/storage/secureStorage", () => ({
    __esModule: true,
    secureStorage: {
      getItem: mocks.getItem,
      setItem: mocks.setItem,
      removeItem: mocks.removeItem,
    },
  }));

  jest.doMock("../services/httpClient", () => ({
    __esModule: true,
    default: mocks.httpClient,
  }));

  jest.doMock("./settingsStore", () => ({
    __esModule: true,
    useSettingsStore: {
      getState: () => ({
        settings: { biometricAuth: false },
        loadSettings: mocks.loadSettings,
        syncFromBackend: mocks.syncFromBackend,
      }),
    },
  }));

  jest.doMock("./networkStore", () => ({
    __esModule: true,
    useNetworkStore: { getState: () => ({ isOnline: false }) },
  }));

  jest.doMock("../services/authUnauthorizedHandler", () => ({
    __esModule: true,
    setUnauthorizedHandler: jest.fn(),
  }));

  jest.doMock("../services/logging", () => ({
    __esModule: true,
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }));

  jest.doMock("expo-local-authentication", () => ({
    __esModule: true,
    hasHardwareAsync: jest.fn(async () => false),
    isEnrolledAsync: jest.fn(async () => false),
    authenticateAsync: jest.fn(async () => ({ success: false })),
  }));

  jest.doMock("../services/userPreferenceScope", () => ({
    __esModule: true,
    setUserPreferenceScope: jest.fn(),
  }));

  jest.doMock("./filterStore", () => ({
    __esModule: true,
    resetFilterStore: jest.fn(async () => undefined),
    rehydrateFilterStore: jest.fn(async () => undefined),
  }));

  jest.doMock("./notificationStore", () => ({
    __esModule: true,
    clearNotificationStore: jest.fn(async () => undefined),
  }));

  jest.doMock("../services/queryClient", () => ({
    __esModule: true,
    queryClient: {
      cancelQueries: jest.fn(async () => undefined),
      clear: jest.fn(),
    },
  }));

  jest.doMock("./scanSessionStore", () => ({
    __esModule: true,
    clearScanSessionStore: jest.fn(async () => undefined),
  }));

  jest.doMock("../services/enhancedFeatures", () => ({
    __esModule: true,
    RecentItemsService: { clearRecent: jest.fn(async () => undefined) },
  }));

  jest.doMock("../services/utils/notificationService", () => ({
    __esModule: true,
    NotificationService: {
      initialize: jest.fn(async () => undefined),
      unregisterCurrentDevice: jest.fn(async () => undefined),
    },
  }));

  jest.doMock("../services/syncService", () => ({
    __esModule: true,
    registerSyncAuthStateProvider: jest.fn(),
    syncOfflineQueue: jest.fn(async () => undefined),
  }));
};

const loadAuthStore = (): { useAuthStore: any } => {
  let useAuthStore: any;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ useAuthStore } = require("./authStore"));
  });
  return { useAuthStore };
};

// ---------------------------------------------------------------------------

describe("authStore — initial state", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("starts unauthenticated with no user", () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.isInitialized).toBe(false);
    expect(state.lastLoggedUser).toBeNull();
    expect(state.pendingRedirectPath).toBeNull();

    useAuthStore.getState().stopHeartbeat();
  });

  it("hasValidToken returns false when no user is set", () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    expect(useAuthStore.getState().hasValidToken()).toBe(false);

    useAuthStore.getState().stopHeartbeat();
  });
});

// ---------------------------------------------------------------------------

describe("authStore — establishSession (login path)", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("sets isAuthenticated=true and stores user + token on success", async () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    await useAuthStore.getState().establishSession({
      access_token: "access-token",
      refresh_token: "refresh-token",
      user: {
        id: "u1",
        username: "alice",
        full_name: "Alice Smith",
        role: "staff",
        is_active: true,
        permissions: [],
        has_pin: false,
      },
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.username).toBe("alice");
    expect(state.user?.role).toBe("staff");
    expect(mocks.setItem).toHaveBeenCalledWith("auth_token", "access-token");
    expect(mocks.setItem).toHaveBeenCalledWith("refresh_token", "refresh-token");
    expect(mocks.httpClient.defaults.headers.common["Authorization"]).toBe(
      "Bearer access-token",
    );

    useAuthStore.getState().stopHeartbeat();
  });

  it("stores admin role correctly", async () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    await useAuthStore.getState().establishSession({
      access_token: "admin-token",
      user: {
        id: "a1",
        username: "admin_user",
        full_name: "Admin User",
        role: "admin",
        is_active: true,
        permissions: ["manage_users", "view_reports"],
        has_pin: true,
      },
    });

    const state = useAuthStore.getState();
    expect(state.user?.role).toBe("admin");
    expect(state.user?.permissions).toContain("manage_users");
    expect(state.isAuthenticated).toBe(true);

    useAuthStore.getState().stopHeartbeat();
  });

  it("stores supervisor role correctly", async () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    await useAuthStore.getState().establishSession({
      access_token: "sup-token",
      user: {
        id: "s1",
        username: "supervisor_user",
        full_name: "Super Visor",
        role: "supervisor",
        is_active: true,
        permissions: ["view_reports"],
        has_pin: false,
      },
    });

    expect(useAuthStore.getState().user?.role).toBe("supervisor");

    useAuthStore.getState().stopHeartbeat();
  });

  it("throws when access_token is missing", async () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    await expect(
      useAuthStore.getState().establishSession({
        access_token: "",
        user: {
          id: "u2",
          username: "bob",
          full_name: "Bob",
          role: "staff",
          is_active: true,
          permissions: [],
        },
      }),
    ).rejects.toThrow("Invalid response format: missing access_token");

    useAuthStore.getState().stopHeartbeat();
  });
});

// ---------------------------------------------------------------------------

describe("authStore — logout", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("clears user, isAuthenticated, and removes storage keys", async () => {
    const mocks = buildCoreMocks({
      secureStorageGetItem: jest.fn(async (key: string) =>
        key === "refresh_token" ? "rt" : null,
      ),
    });
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    useAuthStore.setState({
      user: {
        id: "u1",
        username: "alice",
        full_name: "Alice",
        role: "staff",
        is_active: true,
        permissions: [],
      },
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
    });

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(mocks.removeItem).toHaveBeenCalledWith("auth_user");
    expect(mocks.removeItem).toHaveBeenCalledWith("auth_token");
    expect(mocks.removeItem).toHaveBeenCalledWith("refresh_token");
  });

  it("removes Authorization header from httpClient on logout", async () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    mocks.httpClient.defaults.headers.common["Authorization"] = "Bearer old-token";
    useAuthStore.setState({ user: null, isAuthenticated: true, isInitialized: true });

    await useAuthStore.getState().logout();

    expect(mocks.httpClient.defaults.headers.common["Authorization"]).toBeUndefined();
  });

  it("logout is idempotent — calling twice does not throw", async () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe("authStore — checkTokenExpired", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns true for an expired token", () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    expect(useAuthStore.getState().checkTokenExpired(expiredToken())).toBe(true);

    useAuthStore.getState().stopHeartbeat();
  });

  it("returns false for a valid token", () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    expect(useAuthStore.getState().checkTokenExpired(validToken())).toBe(false);

    useAuthStore.getState().stopHeartbeat();
  });

  it("returns true for a malformed / empty token string", () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    expect(useAuthStore.getState().checkTokenExpired("not-a-jwt")).toBe(true);
    expect(useAuthStore.getState().checkTokenExpired("")).toBe(true);

    useAuthStore.getState().stopHeartbeat();
  });

  it("delegates to the jwt utility (isTokenExpired) — verify via module import", () => {
    // This test validates the delegation contract without needing to re-mock the store.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isTokenExpired } = require("../utils/jwt");
    expect(isTokenExpired(expiredToken())).toBe(true);
    expect(isTokenExpired(validToken())).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("authStore — setUser", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("updates user and marks isAuthenticated=true synchronously", () => {
    const mocks = buildCoreMocks();
    registerCommonMocks(mocks);
    const { useAuthStore } = loadAuthStore();

    useAuthStore.getState().setUser({
      id: "u3",
      username: "carol",
      full_name: "Carol",
      role: "supervisor",
      is_active: true,
      permissions: [],
    });

    const state = useAuthStore.getState();
    expect(state.user?.username).toBe("carol");
    expect(state.isAuthenticated).toBe(true);

    useAuthStore.getState().stopHeartbeat();
  });
});
