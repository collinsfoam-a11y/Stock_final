const loadHttpClientModule = () => {
  // This module must load only after per-test jest.doMock registrations.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../httpClient");
};

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
          handlers: [] as {
            fulfilled?: (value: any) => any;
            rejected?: (error: any) => any;
          }[],
          use: jest.fn(
            (
              fulfilled?: (value: any) => any,
              rejected?: (error: any) => any,
            ) => {
              axiosInstance.interceptors.response.handlers.push({
                fulfilled,
                rejected,
              });
              return 0;
            },
          ),
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

    loadHttpClientModule();
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

  it("does not trigger refresh recovery for auth session probes", async () => {
    const mockHandleUnauthorized = jest.fn();
    const mockSecureStorage = {
      getItem: jest.fn(async () => "refresh-token"),
      removeItem: jest.fn(async () => undefined),
    };

    const axiosInstance: any = Object.assign(jest.fn(), {
      defaults: {
        baseURL: "http://localhost:8001",
        headers: {
          common: {},
          post: {},
          put: {},
          patch: {},
        },
      },
      interceptors: {
        request: { use: jest.fn() },
        response: {
          handlers: [] as {
            fulfilled?: (value: any) => any;
            rejected?: (error: any) => any;
          }[],
          use: jest.fn(
            (
              fulfilled?: (value: any) => any,
              rejected?: (error: any) => any,
            ) => {
              axiosInstance.interceptors.response.handlers.push({
                fulfilled,
                rejected,
              });
              return 0;
            },
          ),
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
        throw new Error("refresh should not be attempted");
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

    loadHttpClientModule();
    const rejected =
      axiosInstance.interceptors.response.handlers[0]?.rejected;

    expect(typeof rejected).toBe("function");

    const error = {
      config: {
        _retry: false,
        _retryRefresh: false,
        headers: {},
        baseURL: "http://localhost:8001",
        url: "/api/auth/me",
      },
      response: {
        status: 401,
        data: {},
      },
    };

    await expect(rejected(error)).rejects.toBe(error);

    expect(axiosModule.post).not.toHaveBeenCalled();
    expect(mockSecureStorage.getItem).not.toHaveBeenCalled();
    expect(mockSecureStorage.removeItem).not.toHaveBeenCalled();
    expect(mockHandleUnauthorized).not.toHaveBeenCalled();
  });
});

describe("httpClient network reachability state", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("marks backend reachable after successful API responses", () => {
    const setIsOnline = jest.fn();
    const setIsInternetReachable = jest.fn();
    const setRestrictedMode = jest.fn();

    const axiosInstance: any = Object.assign(jest.fn(), {
      defaults: {
        baseURL: "http://localhost:8001",
        headers: {
          common: {},
          post: {},
          put: {},
          patch: {},
        },
      },
      interceptors: {
        request: { use: jest.fn() },
        response: {
          handlers: [] as {
            fulfilled?: (value: any) => any;
            rejected?: (error: any) => any;
          }[],
          use: jest.fn(
            (
              fulfilled?: (value: any) => any,
              rejected?: (error: any) => any,
            ) => {
              axiosInstance.interceptors.response.handlers.push({
                fulfilled,
                rejected,
              });
              return 0;
            },
          ),
        },
      },
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    });

    const axiosModule = {
      create: jest.fn(() => axiosInstance),
      post: jest.fn(),
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
      secureStorage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
    }));
    jest.doMock("../authUnauthorizedHandler", () => ({
      handleUnauthorized: jest.fn(),
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
          setIsOnline,
          setIsInternetReachable,
          setRestrictedMode,
        })),
      },
    }));

    loadHttpClientModule();
    const fulfilled =
      axiosInstance.interceptors.response.handlers[0]?.fulfilled;

    expect(typeof fulfilled).toBe("function");

    const response = {
      status: 200,
      config: {
        baseURL: "http://localhost:8001",
        url: "/api/sessions",
      },
    };

    expect(fulfilled?.(response)).toBe(response);
    expect(setIsOnline).toHaveBeenCalledWith(true);
    expect(setIsInternetReachable).toHaveBeenCalledWith(true);
    expect(setRestrictedMode).toHaveBeenCalledWith(false);
  });

  it("mirrors healthy connection manager probes into network state", () => {
    const setIsOnline = jest.fn();
    const setIsInternetReachable = jest.fn();
    const setRestrictedMode = jest.fn();
    let connectionListener:
      | ((connection: {
          backendUrl: string;
          backendPort: number;
          backendIp: string;
          lastChecked: string;
          isHealthy: boolean;
        }) => void)
      | undefined;

    const axiosInstance: any = Object.assign(jest.fn(), {
      defaults: {
        baseURL: "http://localhost:8001",
        headers: {
          common: {},
          post: {},
          put: {},
          patch: {},
        },
      },
      interceptors: {
        request: { use: jest.fn() },
        response: {
          handlers: [] as {
            fulfilled?: (value: any) => any;
            rejected?: (error: any) => any;
          }[],
          use: jest.fn(),
        },
      },
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    });

    const axiosModule = {
      create: jest.fn(() => axiosInstance),
      post: jest.fn(),
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
      secureStorage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
    }));
    jest.doMock("../authUnauthorizedHandler", () => ({
      handleUnauthorized: jest.fn(),
    }));
    jest.doMock("../deviceId", () => ({
      getDeviceId: jest.fn(async () => null),
    }));
    jest.doMock("../connectionManager", () => ({
      __esModule: true,
      default: {
        getInstance: jest.fn(() => ({
          addListener: jest.fn((listener) => {
            connectionListener = listener;
          }),
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
          setIsOnline,
          setIsInternetReachable,
          setRestrictedMode,
        })),
      },
    }));

    loadHttpClientModule();
    expect(typeof connectionListener).toBe("function");

    connectionListener?.({
      backendUrl: "http://localhost:8001",
      backendPort: 8001,
      backendIp: "localhost",
      lastChecked: new Date().toISOString(),
      isHealthy: true,
    });

    expect(setIsOnline).toHaveBeenCalledWith(true);
    expect(setIsInternetReachable).toHaveBeenCalledWith(true);
    expect(setRestrictedMode).toHaveBeenCalledWith(false);
    expect(axiosInstance.defaults.baseURL).toBe("http://localhost:8001");
  });

  it("does not mark the app offline from an unhealthy connection manager probe", () => {
    const setIsOnline = jest.fn();
    const setIsInternetReachable = jest.fn();
    const setRestrictedMode = jest.fn();
    let connectionListener:
      | ((connection: {
          backendUrl: string;
          backendPort: number;
          backendIp: string;
          lastChecked: string;
          isHealthy: boolean;
        }) => void)
      | undefined;

    const axiosInstance: any = Object.assign(jest.fn(), {
      defaults: {
        baseURL: "http://localhost:8001",
        headers: {
          common: {},
          post: {},
          put: {},
          patch: {},
        },
      },
      interceptors: {
        request: { use: jest.fn() },
        response: {
          handlers: [] as {
            fulfilled?: (value: any) => any;
            rejected?: (error: any) => any;
          }[],
          use: jest.fn(),
        },
      },
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    });

    const axiosModule = {
      create: jest.fn(() => axiosInstance),
      post: jest.fn(),
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
      secureStorage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
    }));
    jest.doMock("../authUnauthorizedHandler", () => ({
      handleUnauthorized: jest.fn(),
    }));
    jest.doMock("../deviceId", () => ({
      getDeviceId: jest.fn(async () => null),
    }));
    jest.doMock("../connectionManager", () => ({
      __esModule: true,
      default: {
        getInstance: jest.fn(() => ({
          addListener: jest.fn((listener) => {
            connectionListener = listener;
          }),
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
          setIsOnline,
          setIsInternetReachable,
          setRestrictedMode,
        })),
      },
    }));

    loadHttpClientModule();
    expect(typeof connectionListener).toBe("function");

    connectionListener?.({
      backendUrl: "http://localhost:8002",
      backendPort: 8002,
      backendIp: "localhost",
      lastChecked: new Date().toISOString(),
      isHealthy: false,
    });

    expect(setIsOnline).not.toHaveBeenCalled();
    expect(setIsInternetReachable).not.toHaveBeenCalled();
    expect(setRestrictedMode).not.toHaveBeenCalled();
    expect(axiosInstance.defaults.baseURL).toBe("http://localhost:8001");
  });
});
