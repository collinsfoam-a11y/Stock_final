import { beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("authStore.logout", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("sends the refresh token to logout before clearing local auth state", async () => {
    const getItem = jest.fn(async (key: string) =>
      key === "refresh_token" ? "refresh-token" : null,
    );
    const setItem = jest.fn(async () => undefined);
    const removeItem = jest.fn(async () => undefined);
    const post = jest.fn(async () => ({ data: { success: true } }));
    const loadSettings = jest.fn(async () => undefined);
    const syncFromBackend = jest.fn(async () => undefined);
    const clearNotificationStore = jest.fn(async () => undefined);
    const cancelQueries = jest.fn(async () => undefined);
    const clearQueries = jest.fn();
    const clearScanSessionStore = jest.fn(async () => undefined);
    const clearRecent = jest.fn(async () => undefined);
    const clearAllCache = jest.fn(async () => undefined);

    jest.doMock("../../services/storage/secureStorage", () => ({
      __esModule: true,
      secureStorage: {
        getItem,
        setItem,
        removeItem,
      },
    }));

    const httpClient = {
      defaults: { headers: { common: { Authorization: "Bearer access-token" } } },
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

    jest.doMock("expo-local-authentication", () => ({
      __esModule: true,
      hasHardwareAsync: jest.fn(async () => false),
      isEnrolledAsync: jest.fn(async () => false),
      authenticateAsync: jest.fn(async () => ({ success: false })),
    }));

    jest.doMock("../../services/userPreferenceScope", () => ({
      __esModule: true,
      setUserPreferenceScope: jest.fn(),
    }));

    jest.doMock("../filterStore", () => ({
      __esModule: true,
      resetFilterStore: jest.fn(async () => undefined),
      rehydrateFilterStore: jest.fn(async () => undefined),
    }));

    jest.doMock("../notificationStore", () => ({
      __esModule: true,
      clearNotificationStore,
    }));

    jest.doMock("../../services/queryClient", () => ({
      __esModule: true,
      queryClient: {
        cancelQueries,
        clear: clearQueries,
      },
    }));

    jest.doMock("../scanSessionStore", () => ({
      __esModule: true,
      clearScanSessionStore,
    }));

    jest.doMock("../../services/enhancedFeatures", () => ({
      __esModule: true,
      RecentItemsService: {
        clearRecent: clearRecent,
      },
    }));

    jest.doMock("../../services/offline/offlineStorage", () => ({
      __esModule: true,
      clearAllCache,
    }));

    jest.doMock("../../services/utils/notificationService", () => ({
      __esModule: true,
      NotificationService: {
        initialize: jest.fn(async () => undefined),
        unregisterCurrentDevice: jest.fn(async () => undefined),
      },
    }));

    let useAuthStore: ReturnType<typeof require>;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useAuthStore } = require("../authStore"));
    });

    useAuthStore.setState({
      user: {
        id: "user-1",
        username: "staff1",
        full_name: "Staff One",
        role: "staff",
        is_active: true,
        permissions: [],
        has_pin: false,
      },
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
    });

    await useAuthStore.getState().logout();

    expect(post).toHaveBeenCalledWith("/api/auth/logout", {
      refresh_token: "refresh-token",
    });
    expect(removeItem).toHaveBeenCalledWith("refresh_token");
    expect(httpClient.defaults.headers.common.Authorization).toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isHydrated).toBe(true);
    expect(useAuthStore.getState().authPhase).toBe("unauthenticated");
    expect(useAuthStore.getState().user).toBeNull();
  });
});
