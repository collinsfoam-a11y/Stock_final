import { initAuthAndSettings } from "./initAuthAndSettings";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

jest.mock("../store/authStore", () => ({
  useAuthStore: {
    getState: jest.fn(),
  },
}));

jest.mock("../services/logging", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("initAuthAndSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("defers unauthenticated settings loading when requested", async () => {
    const loadStoredAuth = jest.fn(async () => undefined);
    const settingsRead = deferred<void>();
    const loadSettings = jest.fn(() => settingsRead.promise);
    const { useAuthStore } = jest.requireMock("../store/authStore") as {
      useAuthStore: { getState: jest.Mock };
    };

    useAuthStore.getState.mockReturnValue({ isAuthenticated: false });

    const result = await initAuthAndSettings(loadStoredAuth, loadSettings, {
      deferUnauthenticatedSettings: true,
    });

    expect(loadStoredAuth).toHaveBeenCalledTimes(1);
    expect(loadSettings).toHaveBeenCalledTimes(1);
    expect(result.authResult.status).toBe("fulfilled");
    expect(result.settingsResult.status).toBe("fulfilled");

    settingsRead.resolve();
    await settingsRead.promise;
  });

  it("still waits for settings when deferral is disabled", async () => {
    const loadStoredAuth = jest.fn(async () => undefined);
    const settingsRead = deferred<void>();
    const loadSettings = jest.fn(() => settingsRead.promise);
    const { useAuthStore } = jest.requireMock("../store/authStore") as {
      useAuthStore: { getState: jest.Mock };
    };

    useAuthStore.getState.mockReturnValue({ isAuthenticated: false });

    const pending = initAuthAndSettings(loadStoredAuth, loadSettings);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    settingsRead.resolve();
    const result = await pending;

    expect(result.authResult.status).toBe("fulfilled");
    expect(result.settingsResult.status).toBe("fulfilled");
  });
});
