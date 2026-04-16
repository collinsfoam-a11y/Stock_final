const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("authStore.loadStoredAuth race protection", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("does not overwrite an active session that starts during storage load", async () => {
    const userRead = deferred<string | null>();
    const tokenRead = deferred<string | null>();

    jest.doMock("../../services/storage/secureStorage", () => ({
      __esModule: true,
      secureStorage: {
        getItem: jest.fn(async (key: string) => {
          if (key === "auth_user") return await userRead.promise;
          if (key === "auth_token") return await tokenRead.promise;
          return null;
        }),
        setItem: jest.fn(async () => undefined),
        removeItem: jest.fn(async () => undefined),
      },
    }));

    jest.doMock("../../services/httpClient", () => ({
      __esModule: true,
      default: {
        defaults: { headers: { common: {} as Record<string, string> } },
        post: jest.fn(),
        get: jest.fn(),
      },
    }));

    jest.doMock("../settingsStore", () => ({
      __esModule: true,
      useSettingsStore: {
        getState: () => ({ settings: {}, syncFromBackend: jest.fn() }),
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

    // Use jest.isolateModules + require instead of dynamic import()
    // to avoid needing --experimental-vm-modules
    let useAuthStore: ReturnType<typeof require>;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useAuthStore } = require("../authStore"));
    });

    const loadPromise = useAuthStore.getState().loadStoredAuth();

    useAuthStore.setState({
      user: {
        id: "1",
        username: "staff1",
        full_name: "Staff One",
        role: "staff",
        is_active: true,
        permissions: [],
      },
      isAuthenticated: true,
      isInitialized: true,
    });

    userRead.resolve(null);
    tokenRead.resolve(null);

    await loadPromise;

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.username).toBe("staff1");
  });
});
