/**
 * Tests for biometric PIN storage hardening in authStore.
 *
 * Covers:
 *  - savePinForBiometrics uses SecureStore with requireAuthentication on native
 *  - savePinForBiometrics falls back to secureStorage when SecureStore throws
 *  - getPinForBiometrics returns the SecureStore value when present
 *  - getPinForBiometrics falls back to secureStorage when SecureStore throws
 *  - getPinForBiometrics falls back to secureStorage when SecureStore returns
 *    null (the B1 regression: a PIN saved to the fallback store after a prior
 *    setItemAsync failure must still be readable)
 *  - loginWithBiometric retrieves the PIN via getPinForBiometrics (not a direct
 *    secureStorage read)
 *  - web platform uses secureStorage in both directions
 */

const SECURE_STORE_KEY = "biometric_pin";

type SecureStoreMock = {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: number;
};

type StorageMock = {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
};

const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 2;

const mockPlatform = { OS: "ios" as string };

jest.mock("react-native", () => ({
  __esModule: true,
  Platform: mockPlatform,
  View: "View",
  Text: "Text",
}));

function makeSecureStoreMock(overrides: Partial<SecureStoreMock> = {}): SecureStoreMock {
  return {
    getItemAsync: jest.fn(async () => null),
    setItemAsync: jest.fn(async () => undefined),
    deleteItemAsync: jest.fn(async () => undefined),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    ...overrides,
  };
}

function makeStorageMock(overrides: Partial<StorageMock> = {}): StorageMock {
  return {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
    ...overrides,
  };
}

function applyCommonDoMocks(args: {
  secureStore: SecureStoreMock;
  storage: StorageMock;
}) {
  jest.doMock("expo-secure-store", () => ({
    __esModule: true,
    ...args.secureStore,
    default: args.secureStore,
  }));

  jest.doMock("../../services/storage/secureStorage", () => ({
    __esModule: true,
    secureStorage: args.storage,
  }));

  jest.doMock("../settingsStore", () => ({
    __esModule: true,
    useSettingsStore: {
      getState: () => ({
        settings: { biometricAuth: true },
        loadSettings: jest.fn(async () => undefined),
        syncFromBackend: jest.fn(async () => undefined),
      }),
    },
  }));

  jest.doMock("../networkStore", () => ({
    __esModule: true,
    useNetworkStore: { getState: () => ({ isOnline: false }) },
  }));

  jest.doMock("../../services/authUnauthorizedHandler", () => ({
    __esModule: true,
    default: () => ({}),
  }));

  jest.doMock("../../services/syncService", () => ({
    __esModule: true,
    syncOfflineQueue: jest.fn(async () => undefined),
  }));

  jest.doMock("../../services/utils/notificationService", () => ({
    __esModule: true,
    NotificationService: {
      initialize: jest.fn(async () => undefined),
      unregisterCurrentDevice: jest.fn(async () => undefined),
    },
  }));
}

function requireAuthStore(): any {
  let useAuthStore: any;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ useAuthStore } = require("../authStore"));
  });
  return useAuthStore;
}

describe("authStore biometric PIN storage", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockPlatform.OS = "ios";
  });

  it("savePinForBiometrics stores via SecureStore with requireAuthentication on native", async () => {
    const secureStore = makeSecureStoreMock();
    const storage = makeStorageMock();
    applyCommonDoMocks({ secureStore, storage });

    const useAuthStore = requireAuthStore();

    await useAuthStore.getState().savePinForBiometrics("1234");
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEY, "1234", {
      requireAuthentication: true,
      keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("savePinForBiometrics falls back to secureStorage when SecureStore throws", async () => {
    const secureStore = makeSecureStoreMock({
      setItemAsync: jest.fn(async () => {
        throw new Error("SecureStore unavailable");
      }),
    });
    const storage = makeStorageMock();
    applyCommonDoMocks({ secureStore, storage });

    const useAuthStore = requireAuthStore();

    await useAuthStore.getState().savePinForBiometrics("1234");
    expect(secureStore.setItemAsync).toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenCalledWith(SECURE_STORE_KEY, "1234");
  });

  it("getPinForBiometrics returns the SecureStore value when present", async () => {
    const secureStore = makeSecureStoreMock({
      getItemAsync: jest.fn(async () => "1234"),
    });
    const storage = makeStorageMock();
    applyCommonDoMocks({ secureStore, storage });

    const useAuthStore = requireAuthStore();

    const pin = await useAuthStore.getState().getPinForBiometrics();
    expect(pin).toBe("1234");
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEY, {
      requireAuthentication: true,
    });
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it("getPinForBiometrics falls back to secureStorage when SecureStore throws", async () => {
    const secureStore = makeSecureStoreMock({
      getItemAsync: jest.fn(async () => {
        throw new Error("SecureStore unavailable");
      }),
    });
    const storage = makeStorageMock({
      getItem: jest.fn(async () => "fallback-pin"),
    });
    applyCommonDoMocks({ secureStore, storage });

    const useAuthStore = requireAuthStore();

    const pin = await useAuthStore.getState().getPinForBiometrics();
    expect(pin).toBe("fallback-pin");
    expect(secureStore.getItemAsync).toHaveBeenCalled();
    expect(storage.getItem).toHaveBeenCalledWith(SECURE_STORE_KEY);
  });

  it("getPinForBiometrics falls back to secureStorage when SecureStore returns null", async () => {
    const secureStore = makeSecureStoreMock({
      getItemAsync: jest.fn(async () => null),
    });
    const storage = makeStorageMock({
      getItem: jest.fn(async () => "fallback-pin"),
    });
    applyCommonDoMocks({ secureStore, storage });

    const useAuthStore = requireAuthStore();

    const pin = await useAuthStore.getState().getPinForBiometrics();
    expect(pin).toBe("fallback-pin");
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEY, {
      requireAuthentication: true,
    });
    expect(storage.getItem).toHaveBeenCalledWith(SECURE_STORE_KEY);
  });

  it("loginWithBiometric retrieves the PIN via getPinForBiometrics (not a direct secureStorage read)", async () => {
    const secureStore = makeSecureStoreMock({
      getItemAsync: jest.fn(async () => "1234"),
    });
    const storage = makeStorageMock();
    applyCommonDoMocks({ secureStore, storage });

    const useAuthStore = requireAuthStore();
    useAuthStore.setState({
      user: null,
      lastLoggedUser: { username: "staff1", full_name: "Staff One", has_pin: true },
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
    });

    // Stub loginWithPin so we only assert the PIN-retrieval path.
    const loginWithPin = jest.fn(async () => ({ success: true, message: "ok" }));
    useAuthStore.setState({ loginWithPin });

    const result = await useAuthStore.getState().loginWithBiometric();

    expect(result.success).toBe(true);
    // The PIN must come from SecureStore (getPinForBiometrics), not secureStorage.
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEY, {
      requireAuthentication: true,
    });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(loginWithPin).toHaveBeenCalledWith("1234", "staff1");
  });

  it("web platform uses secureStorage for both save and get (skips SecureStore)", async () => {
    const secureStore = makeSecureStoreMock();
    const storage = makeStorageMock({
      getItem: jest.fn(async () => "web-pin"),
    });
    applyCommonDoMocks({ secureStore, storage });
    mockPlatform.OS = "web";

    const useAuthStore = requireAuthStore();

    await useAuthStore.getState().savePinForBiometrics("webpin");
    expect(storage.setItem).toHaveBeenCalledWith(SECURE_STORE_KEY, "webpin");
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();

    const pin = await useAuthStore.getState().getPinForBiometrics();
    expect(pin).toBe("web-pin");
    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    expect(storage.getItem).toHaveBeenCalledWith(SECURE_STORE_KEY);
  });
});
