describe("authStore.login flow", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const loadStore = ({
    post,
  }: {
    post: jest.Mock;
  }) => {
    const setItem = jest.fn(async () => undefined);
    const removeItem = jest.fn(async () => undefined);
    const loadSettings = jest.fn(async () => undefined);
    const syncFromBackend = jest.fn(async () => undefined);

    jest.doMock("../../services/storage/secureStorage", () => ({
      __esModule: true,
      secureStorage: {
        getItem: jest.fn(async () => null),
        setItem,
        removeItem,
      },
    }));

    const httpClient = {
      defaults: { headers: { common: {} as Record<string, string> } },
      post,
      get: jest.fn(),
    };

    jest.doMock("../../services/httpClient", () => ({
      __esModule: true,
      default: httpClient,
    }));

    jest.doMock("../settingsStore", () => ({
      __esModule: true,
      useSettingsStore: {
        getState: () => ({
          settings: { biometricAuth: false },
          loadSettings,
          syncFromBackend,
        }),
      },
    }));

    jest.doMock("../networkStore", () => ({
      __esModule: true,
      useNetworkStore: { getState: () => ({ isOnline: false }) },
    }));

    jest.doMock("../filterStore", () => ({
      __esModule: true,
      rehydrateFilterStore: jest.fn(async () => undefined),
      resetFilterStore: jest.fn(async () => undefined),
    }));

    jest.doMock("../../services/authUnauthorizedHandler", () => ({
      __esModule: true,
      setUnauthorizedHandler: jest.fn(),
    }));

    jest.doMock("../../services/logging", () => ({
      __esModule: true,
      createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    }));

    jest.doMock("../../services/userPreferenceScope", () => ({
      __esModule: true,
      setUserPreferenceScope: jest.fn(),
    }));

    jest.doMock("../../services/utils/notificationService", () => ({
      __esModule: true,
      NotificationService: {
        initialize: jest.fn(async () => undefined),
        unregisterCurrentDevice: jest.fn(async () => undefined),
      },
    }));

    jest.doMock("../../bootstrap/useWebPublicSession", () => ({
      __esModule: true,
      syncWebPublicSession: jest.fn(),
    }));

    let useAuthStore: ReturnType<typeof require>;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useAuthStore } = require("../authStore"));
    });

    return { httpClient, loadSettings, removeItem, setItem, syncFromBackend, useAuthStore };
  };

  it("waits for session hydration before resolving a successful login", async () => {
    const post = jest.fn(async () => ({
      data: {
        success: true,
        data: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          user: {
            id: "user-1",
            username: "staff1",
            full_name: "Staff One",
            role: "staff",
            is_active: true,
            permissions: [],
            has_pin: false,
          },
        },
      },
    }));

    const { loadSettings, syncFromBackend, useAuthStore } = loadStore({ post });

    const result = await useAuthStore.getState().login("staff1", "password");

    expect(result).toEqual({ success: true });
    expect(loadSettings).toHaveBeenCalled();
    expect(syncFromBackend).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isHydrated).toBe(true);
    expect(useAuthStore.getState().authPhase).toBe("authenticated");
    expect(useAuthStore.getState().user?.username).toBe("staff1");

    useAuthStore.getState().stopHeartbeat();
  });

  it("moves the auth flow into the locked phase when login is rate limited", async () => {
    const post = jest.fn(async () => {
      throw {
        response: {
          status: 429,
          data: {
            detail: {
              code: "RATE_LIMIT_ERROR",
              message: "Too many login attempts",
              retry_after: 45,
            },
          },
        },
      };
    });

    const { useAuthStore } = loadStore({ post });

    const result = await useAuthStore.getState().login("staff1", "password");

    expect(result).toEqual({
      success: false,
      code: "AUTH_RATE_LIMITED",
      message: "Too many login attempts",
      retryAfter: 45,
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isHydrated).toBe(true);
    expect(useAuthStore.getState().authPhase).toBe("locked");
  });
});
