import axios from "axios";
import { Platform } from "react-native";
import { BACKEND_URL } from "./backendUrl";
import { createLogger } from "./logging";
import { secureStorage } from "./storage/secureStorage";
import { handleUnauthorized } from "./authUnauthorizedHandler";
import { getDeviceId } from "./deviceId";
import { useNetworkStore } from "../store/networkStore";
import ConnectionManager, { ConnectionInfo } from "./connectionManager";
import {
  isPublicHealthRequestUrl,
  stripHealthRequestHeaders,
} from "./healthRequest";

const log = createLogger("httpClient");

// Dynamic base URL that gets updated by ConnectionManager
export let API_BASE_URL: string = BACKEND_URL;

const IS_TEST_ENV =
  process.env.NODE_ENV === "test" || typeof process.env.JEST_WORKER_ID !== "undefined";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout to 30s for slower emulator networks
  withCredentials: true,
});

delete apiClient.defaults.headers.common["Content-Type"];
delete apiClient.defaults.headers.common["content-type"];
apiClient.defaults.headers.post["Content-Type"] = "application/json";
apiClient.defaults.headers.put["Content-Type"] = "application/json";
apiClient.defaults.headers.patch["Content-Type"] = "application/json";

/**
 * Initialize connection manager and set up dynamic URL updates
 */
const connectionManager = ConnectionManager.getInstance();

// FIX 3: Explicit initialization (moved from constructor)
if (!IS_TEST_ENV) {
  // Only initialize in non-test environments
  connectionManager.initialize().catch((error) => {
    log.warn("Failed to initialize connection manager", error);
  });
}

/**
 * Update the base URL of the API client.
 * Called after backend reachability probe succeeds.
 */
export const updateBaseURL = (newBaseUrl: string) => {
  if (apiClient.defaults.baseURL === newBaseUrl && API_BASE_URL === newBaseUrl) return;

  log.info("Updating API base URL", {
    old: apiClient.defaults.baseURL,
    new: newBaseUrl,
  });
  apiClient.defaults.baseURL = newBaseUrl;
  API_BASE_URL = newBaseUrl; // Ensure exported constant is actually dynamic
};

connectionManager.addListener((connection: ConnectionInfo) => {
  if (!connection.isHealthy) {
    log.warn("Ignoring unhealthy connection update", {
      candidate: connection.backendUrl,
      current: apiClient.defaults.baseURL || API_BASE_URL,
    });
    return;
  }

  // L3 fix: Log old URL before updating to avoid logging stale value
  const previousUrl = apiClient.defaults.baseURL;
  updateBaseURL(connection.backendUrl);
  log.info("API base URL updated via ConnectionManager", {
    old: previousUrl,
    new: connection.backendUrl,
    isHealthy: connection.isHealthy,
  });
});

const summarizePayload = (payload: unknown): Record<string, unknown> | undefined => {
  if (payload == null) return undefined;
  if (typeof payload === "string") return { type: "string", length: payload.length };
  if (typeof payload === "number" || typeof payload === "boolean") return { type: typeof payload };
  if (Array.isArray(payload)) return { type: "array", length: payload.length };
  if (typeof payload === "object") {
    const keys = Object.keys(payload as Record<string, unknown>);
    return { type: "object", keys: keys.slice(0, 25), keyCount: keys.length };
  }
  return { type: typeof payload };
};

// Log resolved base URL once (dev only)
if (!IS_TEST_ENV) {
  log.info("API base URL initialised", { baseUrl: API_BASE_URL });
}

// Auto-detect backend reachability (handles LAN IP changes) and update baseURL
if (!IS_TEST_ENV) {
  log.info("API client initialized", { baseUrl: API_BASE_URL });
}

// Helper to build a full URL for logging
const toFullUrl = (baseURL: string | undefined, url: string | undefined) => {
  const base = (baseURL || "").replace(/\/$/, "");
  const path = (url || "").replace(/^\//, "");
  if (!url) return base || "";
  if (/^https?:\/\//i.test(url)) return url;
  return base ? `${base}/${path}` : url;
};

const summarizeResponseData = (data: unknown): Record<string, unknown> | undefined => {
  if (data == null) return undefined;
  if (typeof data === "string") return { type: "string", length: data.length };
  if (Array.isArray(data)) return { type: "array", length: data.length };
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    return {
      type: "object",
      keys: keys.slice(0, 25),
      keyCount: keys.length,
      message: typeof obj.message === "string" ? obj.message : undefined,
      detail: typeof obj.detail === "string" ? obj.detail : undefined,
      code: typeof obj.code === "string" ? obj.code : undefined,
    };
  }
  return { type: typeof data };
};

const shouldLogNetworkDebug =
  !IS_TEST_ENV &&
  (typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV === "development");
const CAN_USE_COOKIE_AUTH = Platform.OS === "web";

let refreshInFlight: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = await secureStorage.getItem("refresh_token");
  if (!refreshToken && !CAN_USE_COOKIE_AUTH) return null;

  const baseURL = apiClient.defaults.baseURL || API_BASE_URL;
  const refreshUrl = toFullUrl(baseURL, "/api/auth/refresh");
  const refreshPayload = refreshToken ? { refresh_token: refreshToken } : {};

  try {
    const response = await axios.post(
      refreshUrl,
      refreshPayload,
      {
        timeout: 20000,
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      }
    );

    const payload =
      response.data && typeof response.data === "object" && "data" in response.data
        ? (response.data as { data?: any }).data
        : response.data;

    const accessToken = payload?.access_token;
    const nextRefreshToken = payload?.refresh_token;

    if (!accessToken || typeof accessToken !== "string") return null;

    await secureStorage.setItem("auth_token", accessToken);
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;

    if (nextRefreshToken && typeof nextRefreshToken === "string") {
      await secureStorage.setItem("refresh_token", nextRefreshToken);
    }

    return accessToken;
  } catch (_err) {
    return null;
  }
};

const ensureHeadersObject = (config: any): Record<string, any> => {
  if (!config.headers) {
    config.headers = {};
  }
  return config.headers as Record<string, any>;
};

const isPublicRequestUrl = (fullUrl: string, isHealthRequest: boolean): boolean =>
  fullUrl.includes("/auth/login") ||
  fullUrl.includes("/auth/login-pin") ||
  fullUrl.includes("/auth/refresh") ||
  fullUrl.includes("/auth/logout") ||
  isHealthRequest;

const getAuthHeaderFromConfig = (config: any): unknown => {
  const headers = ensureHeadersObject(config);
  return (
    headers["Authorization"] ||
    headers.common?.["Authorization"] ||
    apiClient.defaults.headers.common["Authorization"]
  );
};

const attachDeviceIdHeader = async (config: any): Promise<void> => {
  try {
    const deviceId = await getDeviceId();
    if (deviceId) {
      ensureHeadersObject(config)["X-Device-ID"] = deviceId;
    }
  } catch (err) {
    log.warn("Failed to attach device ID header", { error: String(err) });
  }
};

const injectAuthTokenIfMissing = async (config: any, isHealthRequest: boolean): Promise<void> => {
  const headers = ensureHeadersObject(config);
  if (isHealthRequest || headers["Authorization"] || headers.common?.["Authorization"]) {
    return;
  }

  try {
    const token = await secureStorage.getItem("auth_token");
    if (!token) return;
    headers["Authorization"] = `Bearer ${token}`;
    if (shouldLogNetworkDebug) {
      log.debug("Injected missing Auth token from storage");
    }
  } catch {
    // Ignore storage errors, proceed without token
  }
};

const logRequestDebug = (
  fullUrl: string,
  config: any,
  authHeader: unknown,
): void => {
  if (!shouldLogNetworkDebug) return;
  const hasAuth = Boolean(authHeader);
  if (!hasAuth && !fullUrl.includes("/auth/login") && !fullUrl.includes("/health")) {
    log.debug("API request (No Auth Header)", { url: fullUrl });
  } else if (hasAuth && !fullUrl.includes("/auth/login")) {
    const tokenString = String(authHeader);
    log.debug("API request (With Auth)", {
      url: fullUrl,
      headerType: typeof authHeader,
      tokenPrefix: tokenString.substring(0, 15),
      tokenLength: tokenString.length,
    });
  }

  log.debug("API request", {
    method: config.method?.toUpperCase(),
    url: fullUrl,
    payload: summarizePayload(config.data),
  });
};

// Add request interceptor for debugging (never log raw payloads or auth headers)
apiClient.interceptors.request.use(
  async (config) => {
    const fullUrl = toFullUrl(config.baseURL, config.url);
    const isHealthRequest = isPublicHealthRequestUrl(fullUrl);

    if (isHealthRequest) {
      stripHealthRequestHeaders(ensureHeadersObject(config));
    } else {
      await attachDeviceIdHeader(config);
    }

    await injectAuthTokenIfMissing(config, isHealthRequest);
    const authHeader = getAuthHeaderFromConfig(config);
    logRequestDebug(fullUrl, config, authHeader);

    const isPublic = isPublicRequestUrl(fullUrl, isHealthRequest);
    const hasAuth = Boolean(authHeader);
    if (!isPublic && !hasAuth && !CAN_USE_COOKIE_AUTH) {
      log.warn("Blocking authenticated call: No token available", {
        url: fullUrl,
      });
      return Promise.reject({
        message: "Unauthenticated request blocked",
        config: config,
        isBlocked: true,
      });
    }

    return config;
  },
  (error) => {
    log.error("API request interceptor error", {
      error: (error as { message?: string } | null)?.message || String(error),
    });
    return Promise.reject(error);
  }
);

// 401 Circuit Breaker - Prevent logout storms
let lastUnauthorizedTime = 0;
const UNAUTHORIZED_DEBOUNCE_MS = 5000; // 5 seconds
let unauthorizedHandlerCallCount = 0;

// Add response interceptor for debugging and session handling
apiClient.interceptors.response.use(
  (response) => {
    if (shouldLogNetworkDebug) {
      const fullUrl = toFullUrl(response.config.baseURL, response.config.url);
      log.debug("API response", { status: response.status, url: fullUrl });
    }
    return response;
  },
  async (error) => {
    const fullUrl = toFullUrl(error.config?.baseURL, error.config?.url);
    const status = error.response?.status;
    const data = error.response?.data as { code?: string; message?: string } | undefined;
    const errorCode = data?.code;

    // Helper to perform debounced logout
    const performLogout = () => {
      const now = Date.now();
      const timeSinceLastUnauthorized = now - lastUnauthorizedTime;

      if (timeSinceLastUnauthorized < UNAUTHORIZED_DEBOUNCE_MS) {
        unauthorizedHandlerCallCount++;
        log.warn("401 circuit breaker active - ignoring subsequent unauthorized", {
          url: fullUrl,
          count: unauthorizedHandlerCallCount,
          timeSinceLast: timeSinceLastUnauthorized,
        });
        return;
      }

      // Reset circuit breaker
      lastUnauthorizedTime = now;
      unauthorizedHandlerCallCount = 1;

      // Clear storage immediately to prevent stale token persistence
      secureStorage.removeItem("auth_token").catch(() => {});
      secureStorage.removeItem("refresh_token").catch(() => {});
      delete apiClient.defaults.headers.common["Authorization"];

      handleUnauthorized();
    };

    // Handle Network Restrictions (403 NETWORK_NOT_ALLOWED)
    if (status === 403 && errorCode === "NETWORK_NOT_ALLOWED") {
      log.warn("Network restricted: App is outside allowed LAN", {
        url: fullUrl,
      });
      useNetworkStore.getState().setRestrictedMode(true);
      // We don't reject immediately if we want the UI to handle it, but usually we reject
      // and let the UI show the "Restricted Mode" banner based on the store state.
      return Promise.reject(error);
    }

    // Handle Session Revocation (401/403 SESSION_REVOKED)
    if ((status === 401 || status === 403) && errorCode === "SESSION_REVOKED") {
      log.warn("Session revoked (single device enforcement)", { url: fullUrl });
      performLogout();
      return Promise.reject(error);
    }

    // Handle session expiration (401 Unauthorized) - General case
    if (status === 401) {
      // Prevent infinite loops: If the logout call itself fails with 401,
      // we are already logged out on the server, so just ignore it.
      const isLogout = fullUrl.includes("/api/auth/logout");
      if (isLogout) {
        log.debug("Logout API call returned 401 (ignoring)", { url: fullUrl });
        return Promise.reject(error);
      }

      const isRefresh = fullUrl.includes("/api/auth/refresh");
      if (isRefresh) {
        log.warn("Token refresh request returned 401", { url: fullUrl });
        performLogout();
        return Promise.reject(error);
      }

      // L4 fix: Skip the stale token retry — go directly to refresh flow.
      // The stored token is the same one that caused the 401, so retrying
      // with it just wastes a round-trip.
      const originalRequest = error.config;

      // Attempt a refresh-token flow once.
      if (!originalRequest._retryRefresh) {
        originalRequest._retryRefresh = true;
        log.debug("401 after retry; attempting refresh token flow", {
          url: fullUrl,
        });

        try {
          if (!refreshInFlight) {
            refreshInFlight = refreshAccessToken().finally(() => {
              refreshInFlight = null;
            });
          }

          return refreshInFlight.then((newToken) => {
            if (newToken) {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
              return apiClient(originalRequest);
            }

            log.warn("Refresh token flow failed; clearing credentials", {
              url: fullUrl,
            });
            performLogout();
            return Promise.reject(error);
          });
        } catch (_e) {
          performLogout();
          return Promise.reject(error);
        }
      }

      log.warn("API unauthorized after retry; clearing credentials", {
        url: fullUrl,
      });

      performLogout();
      return Promise.reject(error);
    }

    if (status) {
      // 404 is often an expected state (e.g. item not found), so use warn instead of error
      if (status === 404) {
        log.warn("API resource not found (404)", {
          url: fullUrl,
          data: summarizeResponseData(error.response?.data),
        });
      } else {
        log.error("API error response", {
          status,
          url: fullUrl,
          data: summarizeResponseData(error.response?.data),
        });
      }
    } else if (error.request) {
      log.warn("API no response received (timeout/network)", { url: fullUrl });
    } else {
      log.error("API error", {
        url: fullUrl,
        error: (error as { message?: string } | null)?.message || String(error),
      });
    }

    return Promise.reject(error);
  }
);

export default apiClient;
export { connectionManager };
