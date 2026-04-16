describe("authStore.establishSession", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("persists tokens, user, and last logged user metadata", async () => {
    const setItem = jest.fn(async () => undefined);
    const removeItem = jest.fn(async () => undefined);
    const loadSettings = jest.fn(async () => undefined);
    const syncFromBackend = jest.fn();

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
      post: jest.fn(),
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

    let useAuthStore: ReturnType<typeof require>;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useAuthStore } = require("../authStore"));
    });

    await useAuthStore.getState().establishSession({
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
    });

    const state = useAuthStore.getState();

    expect(httpClient.defaults.headers.common.Authorization).toBe(
      "Bearer access-token",
    );
    expect(setItem).toHaveBeenCalledWith("auth_token", "access-token");
    expect(setItem).toHaveBeenCalledWith("refresh_token", "refresh-token");
    expect(setItem).toHaveBeenCalledWith(
      "auth_user",
      JSON.stringify({
        id: "user-1",
        username: "staff1",
        full_name: "Staff One",
        role: "staff",
        is_active: true,
        permissions: [],
        has_pin: false,
      }),
    );
    expect(setItem).toHaveBeenCalledWith(
      "last_logged_user",
      JSON.stringify({
        username: "staff1",
        full_name: "Staff One",
        has_pin: false,
      }),
    );
    expect(loadSettings).toHaveBeenCalled();
    expect(syncFromBackend).toHaveBeenCalled();
    expect(state.isAuthenticated).toBe(true);
    expect(state.isInitialized).toBe(true);
    expect(state.user?.username).toBe("staff1");
    expect(state.lastLoggedUser?.username).toBe("staff1");

    useAuthStore.getState().stopHeartbeat();
  });
});
