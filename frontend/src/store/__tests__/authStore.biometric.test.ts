describe("authStore biometric PIN storage", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const setupStore = () => {
    const store = new Map<string, string>();
    const getItem = jest.fn(async (key: string) => store.get(key) ?? null);
    const setItem = jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    });
    const removeItem = jest.fn(async (key: string) => {
      store.delete(key);
    });

    jest.doMock("../../services/storage/secureStorage", () => ({
      __esModule: true,
      secureStorage: { getItem, setItem, removeItem },
    }));

    jest.doMock("../settingsStore", () => ({
      __esModule: true,
      useSettingsStore: {
        getState: () => ({
          settings: { biometricAuth: false },
          loadSettings: jest.fn(async () => undefined),
          syncFromBackend: jest.fn(async () => undefined),
        }),
      },
    }));

    jest.doMock("../../services/httpClient", () => ({
      __esModule: true,
      default: {
        defaults: { headers: { common: {} } },
        get: jest.fn(),
        post: jest.fn(),
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

    jest.doMock("../../services/userPreferenceScope", () => ({
      __esModule: true,
      setUserPreferenceScope: jest.fn(),
    }));

    let useAuthStore!: typeof import("../authStore").useAuthStore;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useAuthStore } = require("../authStore"));
    });

    return { useAuthStore, getItem, setItem, removeItem };
  };

  it("saves, reads, and clears the biometric PIN", async () => {
    const { useAuthStore, setItem, removeItem } = setupStore();

    await useAuthStore.getState().savePinForBiometrics("1234");
    await expect(useAuthStore.getState().getPinForBiometrics()).resolves.toBe("1234");
    await useAuthStore.getState().clearPinForBiometrics();
    await expect(useAuthStore.getState().getPinForBiometrics()).resolves.toBeNull();

    expect(setItem).toHaveBeenCalledWith("biometric_pin", "1234");
    expect(removeItem).toHaveBeenCalledWith("biometric_pin");
  });
});
