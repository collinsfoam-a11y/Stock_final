describe("authStore.loadStoredAuth web guest bootstrap", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("uses public-session and skips /api/auth/me for guest web sessions", async () => {
    const syncWebPublicSession = jest.fn();
    const get = jest.fn(async (url: string) => {
      if (url === "/api/auth/public-session") {
        return {
          data: {
            success: true,
            data: {
              status: "guest",
              user: null,
            },
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactNative = require("react-native");
    const originalOsDescriptor = Object.getOwnPropertyDescriptor(
      ReactNative.Platform,
      "OS",
    );
    Object.defineProperty(ReactNative.Platform, "OS", {
      configurable: true,
      value: "web",
    });

    jest.doMock("../../services/storage/secureStorage", () => ({
      __esModule: true,
      secureStorage: {
        getItem: jest.fn(async () => null),
        setItem: jest.fn(async () => undefined),
        removeItem: jest.fn(async () => undefined),
      },
    }));

    jest.doMock("../../services/httpClient", () => ({
      __esModule: true,
      default: {
        defaults: { headers: { common: {} as Record<string, string> } },
        post: jest.fn(),
        get,
      },
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

    jest.doMock("../../bootstrap/useWebPublicSession", () => ({
      __esModule: true,
      syncWebPublicSession,
    }));

    jest.doMock("../settingsStore", () => ({
      __esModule: true,
      useSettingsStore: {
        getState: () => ({
          settings: {},
          loadSettings: jest.fn(async () => undefined),
          syncFromBackend: jest.fn(),
        }),
      },
    }));

    jest.doMock("../networkStore", () => ({
      __esModule: true,
      useNetworkStore: { getState: () => ({ isOnline: false }) },
    }));

    try {
      let useAuthStore: ReturnType<typeof require>;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ({ useAuthStore } = require("../authStore"));
      });

      await useAuthStore.getState().loadStoredAuth();

      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith("/api/auth/public-session");
      expect(syncWebPublicSession).toHaveBeenCalledWith(null);
      expect(useAuthStore.getState().isInitialized).toBe(true);
      expect(useAuthStore.getState().isHydrated).toBe(true);
      expect(useAuthStore.getState().authPhase).toBe("unauthenticated");
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    } finally {
      if (originalOsDescriptor) {
        Object.defineProperty(ReactNative.Platform, "OS", originalOsDescriptor);
      }
    }
  });
});
