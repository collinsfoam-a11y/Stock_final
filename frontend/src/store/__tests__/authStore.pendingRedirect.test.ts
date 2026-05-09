import { beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("authStore pending redirect", () => {
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

  it("stores and consumes a valid pending redirect path", async () => {
    const { useAuthStore, setItem, removeItem } = setupStore();
    const path = "/staff/scan?sessionId=e2e";

    await useAuthStore.getState().setPendingRedirect(path);
    expect(useAuthStore.getState().pendingRedirectPath).toBe(path);
    expect(setItem).toHaveBeenCalledWith("auth_pending_redirect", path);

    const consumed = await useAuthStore.getState().consumePendingRedirect();
    expect(consumed).toBe(path);
    expect(useAuthStore.getState().pendingRedirectPath).toBeNull();
    expect(removeItem).toHaveBeenCalledWith("auth_pending_redirect");
  });

  it("peeks pending redirect without consuming storage", async () => {
    const { useAuthStore, removeItem } = setupStore();
    const path = "/staff/history?approved=1";

    await useAuthStore.getState().setPendingRedirect(path);
    const peeked = await useAuthStore.getState().peekPendingRedirect();

    expect(peeked).toBe(path);
    expect(useAuthStore.getState().pendingRedirectPath).toBe(path);
    expect(removeItem).not.toHaveBeenCalledWith("auth_pending_redirect");
  });

  it("rejects unsafe pending redirect paths", async () => {
    const { useAuthStore, setItem, removeItem } = setupStore();

    await useAuthStore.getState().setPendingRedirect("https://example.com/evil");
    expect(useAuthStore.getState().pendingRedirectPath).toBeNull();
    expect(setItem).not.toHaveBeenCalledWith("auth_pending_redirect", expect.any(String));
    expect(removeItem).toHaveBeenCalledWith("auth_pending_redirect");
  });

  it("rejects public and protocol-relative pending redirect paths", async () => {
    const { useAuthStore, setItem, removeItem } = setupStore();

    await useAuthStore.getState().setPendingRedirect("/login?next=/staff/home");
    await useAuthStore.getState().setPendingRedirect("//example.com/staff/home");

    expect(useAuthStore.getState().pendingRedirectPath).toBeNull();
    expect(setItem).not.toHaveBeenCalledWith("auth_pending_redirect", expect.any(String));
    expect(removeItem).toHaveBeenCalledWith("auth_pending_redirect");
  });

  it("removes invalid pending redirect values from storage on peek", async () => {
    const { useAuthStore, getItem, removeItem } = setupStore();
    getItem.mockImplementation(async (key: string) =>
      key === "auth_pending_redirect" ? "//example.com/staff/home" : null
    );

    const peeked = await useAuthStore.getState().peekPendingRedirect();

    expect(peeked).toBeNull();
    expect(useAuthStore.getState().pendingRedirectPath).toBeNull();
    expect(removeItem).toHaveBeenCalledWith("auth_pending_redirect");
  });

  it("hydrates pending redirect from storage on load", async () => {
    const { useAuthStore, getItem } = setupStore();
    getItem.mockImplementation(async (key: string) =>
      key === "auth_pending_redirect" ? "/staff/history?approved=1" : null
    );

    await useAuthStore.getState().loadStoredAuth();
    expect(useAuthStore.getState().pendingRedirectPath).toBe("/staff/history?approved=1");
  });

  it("removes invalid pending redirect values from storage on load", async () => {
    const { useAuthStore, getItem, removeItem } = setupStore();
    getItem.mockImplementation(async (key: string) =>
      key === "auth_pending_redirect" ? "/login?next=/staff/history" : null
    );

    await useAuthStore.getState().loadStoredAuth();

    expect(useAuthStore.getState().pendingRedirectPath).toBeNull();
    expect(removeItem).toHaveBeenCalledWith("auth_pending_redirect");
  });
});
