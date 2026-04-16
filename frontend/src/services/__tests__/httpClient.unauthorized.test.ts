import { beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("httpClient unauthorized recovery", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("forces logout when refresh recovery cannot issue a new access token", async () => {
    const mockHandleUnauthorized = jest.fn();
    const mockSecureStorage = {
      getItem: jest.fn(async () => "refresh-token"),
      removeItem: jest.fn(async () => undefined),
    };

    const axiosInstance: any = Object.assign(jest.fn(), {
      defaults: {
        baseURL: "http://localhost:8001",
        headers: {
          common: { Authorization: "Bearer stale-token" },
          post: {},
          put: {},
          patch: {},
        },
      },
      interceptors: {
        request: { use: jest.fn() },
        response: {
          handlers: [] as { fulfilled?: unknown; rejected?: any }[],
          use: jest.fn((fulfilled, rejected) => {
            axiosInstance.interceptors.response.handlers.push({
              fulfilled,
              rejected,
            });
            return 0;
          }),
        },
      },
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    });

    const axiosModule = {
      create: jest.fn(() => axiosInstance),
      post: jest.fn(async () => {
        throw new Error("refresh failed");
      }),
    };

    jest.doMock("axios", () => ({
      __esModule: true,
      default: axiosModule,
    }));
    jest.doMock("../backendUrl", () => ({
      BACKEND_URL: "http://localhost:8001",
    }));
    jest.doMock("../logging", () => ({
      createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      }),
    }));
    jest.doMock("../storage/secureStorage", () => ({
      secureStorage: mockSecureStorage,
    }));
    jest.doMock("../authUnauthorizedHandler", () => ({
      handleUnauthorized: mockHandleUnauthorized,
    }));
    jest.doMock("../deviceId", () => ({
      getDeviceId: jest.fn(async () => null),
    }));
    jest.doMock("../connectionManager", () => ({
      __esModule: true,
      default: {
        getInstance: jest.fn(() => ({
          addListener: jest.fn(),
          removeListener: jest.fn(),
          initialize: jest.fn(async () => undefined),
        })),
      },
    }));
    jest.doMock("../healthRequest", () => ({
      isPublicHealthRequestUrl: jest.fn(() => false),
      stripHealthRequestHeaders: jest.fn(),
    }));
    jest.doMock("../../store/networkStore", () => ({
      useNetworkStore: {
        getState: jest.fn(() => ({
          setRestrictedMode: jest.fn(),
        })),
      },
    }));

    await import("../httpClient");
    const rejected =
      axiosInstance.interceptors.response.handlers[0]?.rejected;

    expect(typeof rejected).toBe("function");

    const error = {
      config: {
        _retry: true,
        _retryRefresh: false,
        headers: {},
        baseURL: "http://localhost:8001",
        url: "/api/sessions/sess-123/stats",
      },
      response: {
        status: 401,
        data: {},
      },
    };

    await expect(rejected(error)).rejects.toBe(error);

    expect(mockSecureStorage.getItem).toHaveBeenCalledWith("refresh_token");
    expect(mockSecureStorage.removeItem).toHaveBeenCalledWith("auth_token");
    expect(mockSecureStorage.removeItem).toHaveBeenCalledWith("refresh_token");
    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
    expect(axiosInstance.defaults.headers.common.Authorization).toBeUndefined();
  });
});
