/**
 * Tests for src/services/storage/secureStorage.ts
 *
 * Strategy:
 *  - Mock expo-secure-store for native paths.
 *  - Provide in-memory localStorage / sessionStorage stubs for web paths.
 *  - Use jest.resetModules() + require() in each describe block so we can
 *    switch Platform.OS between "ios" and "web" per suite.
 */

// ---------------------------------------------------------------------------
// expo-secure-store mock (always present so the module can be imported)
// ---------------------------------------------------------------------------
jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// ---------------------------------------------------------------------------
// react-native Platform mock — we override Platform.OS per suite
// ---------------------------------------------------------------------------
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// ---------------------------------------------------------------------------
// Minimal localStorage / sessionStorage stubs for the web suite
// ---------------------------------------------------------------------------
const makeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
    }),
    _store: store,
    _clear: () => store.clear(),
  };
};

// ---------------------------------------------------------------------------
// Helper: fresh require after Platform.OS has been set
// ---------------------------------------------------------------------------
function requireModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./secureStorage") as {
    secureStorage: {
      setItem(key: string, value: string): Promise<void>;
      getItem(key: string): Promise<string | null>;
      removeItem(key: string): Promise<void>;
    };
  };
}

// ---------------------------------------------------------------------------
// Suite 1: Native (iOS/Android) — delegates to expo-secure-store
// ---------------------------------------------------------------------------
describe("secureStorage — native (iOS)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let SecureStore: jest.Mocked<typeof import("expo-secure-store")>;
  let storage: ReturnType<typeof requireModule>["secureStorage"];

  beforeAll(() => {
    jest.resetModules();
    // Platform.OS is already "ios" from the mock above
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SecureStore = require("expo-secure-store");
    storage = requireModule().secureStorage;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("setItem delegates to SecureStore.setItemAsync", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValueOnce(undefined);
    await storage.setItem("auth_token", "tok123");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("auth_token", "tok123", expect.any(Object));
  });

  it("getItem delegates to SecureStore.getItemAsync", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce("tok123");
    const result = await storage.getItem("auth_token");
    expect(result).toBe("tok123");
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith("auth_token", expect.any(Object));
  });

  it("getItem returns null when SecureStore returns null", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    const result = await storage.getItem("missing_key");
    expect(result).toBeNull();
  });

  it("getItem returns null (via timeout) when SecureStore hangs", async () => {
    jest.useFakeTimers();
    (SecureStore.getItemAsync as jest.Mock).mockReturnValueOnce(new Promise(() => {})); // never resolves
    const resultPromise = storage.getItem("auth_token");
    jest.advanceTimersByTime(2500);
    const result = await resultPromise;
    expect(result).toBeNull();
    jest.useRealTimers();
  });

  it("removeItem delegates to SecureStore.deleteItemAsync", async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValueOnce(undefined);
    await storage.removeItem("auth_token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("auth_token", expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Web — auth token keys use in-memory store (WEB_MEMORY_ONLY_KEYS)
// ---------------------------------------------------------------------------
describe("secureStorage — web, auth-token keys (memory-only)", () => {
  let localStorage: ReturnType<typeof makeStorage>;
  let sessionStorage: ReturnType<typeof makeStorage>;
  let storage: ReturnType<typeof requireModule>["secureStorage"];

  beforeAll(() => {
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const platform = require("react-native");
    platform.Platform.OS = "web";

    localStorage = makeStorage();
    sessionStorage = makeStorage();

    // Inject into global so the module can reference them
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: sessionStorage,
      writable: true,
      configurable: true,
    });

    storage = requireModule().secureStorage;
  });

  beforeEach(() => {
    localStorage._clear();
    sessionStorage._clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Reset Platform.OS for subsequent suites
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react-native").Platform.OS = "ios";
  });

  it("setItem for auth_token writes to the in-memory store, not localStorage", async () => {
    await storage.setItem("auth_token", "web-tok");
    expect(localStorage.setItem).not.toHaveBeenCalledWith("auth_token", "web-tok");
  });

  it("getItem for auth_token returns the in-memory value", async () => {
    await storage.setItem("auth_token", "web-tok");
    const result = await storage.getItem("auth_token");
    expect(result).toBe("web-tok");
  });

  it("getItem migrates a legacy localStorage auth_token into memory and removes it", async () => {
    // Ensure in-memory store has no cached value first (removeItem clears it)
    await storage.removeItem("auth_token");
    // Simulate old value sitting in localStorage
    localStorage._store.set("auth_token", "legacy-tok");

    const result = await storage.getItem("auth_token");

    expect(result).toBe("legacy-tok");
    // Migrated: no longer in localStorage
    expect(localStorage.removeItem).toHaveBeenCalledWith("auth_token");
  });

  it("removeItem for auth_token clears the in-memory value", async () => {
    await storage.setItem("auth_token", "web-tok");
    await storage.removeItem("auth_token");
    const result = await storage.getItem("auth_token");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Web — non-auth keys use localStorage
// ---------------------------------------------------------------------------
describe("secureStorage — web, non-auth keys (localStorage)", () => {
  let localStorage: ReturnType<typeof makeStorage>;
  let storage: ReturnType<typeof requireModule>["secureStorage"];

  beforeAll(() => {
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const platform = require("react-native");
    platform.Platform.OS = "web";

    localStorage = makeStorage();
    const sessionStorage = makeStorage();

    Object.defineProperty(globalThis, "localStorage", {
      value: localStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: sessionStorage,
      writable: true,
      configurable: true,
    });

    storage = requireModule().secureStorage;
  });

  beforeEach(() => {
    localStorage._clear();
    jest.clearAllMocks();
  });

  it("setItem for a non-auth key writes to localStorage", async () => {
    await storage.setItem("user_preferences", "dark-mode");
    expect(localStorage.setItem).toHaveBeenCalledWith("user_preferences", "dark-mode");
  });

  it("getItem for a non-auth key reads from localStorage", async () => {
    localStorage._store.set("user_preferences", "dark-mode");
    const result = await storage.getItem("user_preferences");
    expect(result).toBe("dark-mode");
  });

  it("getItem returns null when key is absent from localStorage", async () => {
    const result = await storage.getItem("nonexistent");
    expect(result).toBeNull();
  });

  it("removeItem for a non-auth key removes from localStorage", async () => {
    localStorage._store.set("user_preferences", "dark-mode");
    await storage.removeItem("user_preferences");
    expect(localStorage.removeItem).toHaveBeenCalledWith("user_preferences");
  });
});
