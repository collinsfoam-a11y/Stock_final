/* eslint-disable @typescript-eslint/no-require-imports -- sync test-env module access is intentional here */
import { create } from "zustand";
import { Platform } from "react-native";
import { secureStorage } from "../services/storage/secureStorage";
import { useSettingsStore } from "./settingsStore";
import { setUnauthorizedHandler } from "../services/authUnauthorizedHandler";
import { createLogger } from "../services/logging";
import { setUserPreferenceScope } from "../services/userPreferenceScope";
import { syncWebPublicSession } from "../bootstrap/useWebPublicSession";
import { normalizeAuthApiError } from "../utils/authApiErrors";

interface User {
  id: string;
  username: string;
  full_name: string;
  role: "staff" | "supervisor" | "admin";
  email?: string;
  is_active: boolean;
  permissions: string[];
  has_pin?: boolean;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP: number[] = (() => {
  const table = new Array<number>(256).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

const normalizeBase64Url = (value: string): string => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  return padding === 0 ? base64 : base64 + "=".repeat(4 - padding);
};

const decodeBase64 = (value: string): string => {
  const atobFn = (globalThis as any).atob as ((input: string) => string) | undefined;
  if (typeof atobFn === "function") {
    return atobFn(value);
  }

  const BufferCtor = (globalThis as any).Buffer as
    | { from: (input: string, encoding: "base64") => { toString: (enc: "utf8") => string } }
    | undefined;
  if (BufferCtor && typeof BufferCtor.from === "function") {
    return BufferCtor.from(value, "base64").toString("utf8");
  }

  // Minimal base64 decoder polyfill (sufficient for JWT JSON payloads).
  const cleaned = value.replace(/[^A-Za-z0-9+/=]/g, "");
  let output = "";

  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = cleaned.charCodeAt(i);
    const c2 = cleaned.charCodeAt(i + 1);
    const c3 = cleaned.charAt(i + 2);
    const c4 = cleaned.charAt(i + 3);

    const e1 = BASE64_LOOKUP[c1] ?? -1;
    const e2 = BASE64_LOOKUP[c2] ?? -1;
    const e3 = c3 === "=" ? 64 : (BASE64_LOOKUP[c3.charCodeAt(0)] ?? -1);
    const e4 = c4 === "=" ? 64 : (BASE64_LOOKUP[c4.charCodeAt(0)] ?? -1);

    if (e1 < 0 || e2 < 0 || e3 < 0 || e4 < 0) {
      throw new Error("Invalid base64 payload");
    }

    const triple = (e1 << 18) | (e2 << 12) | ((e3 & 63) << 6) | (e4 & 63);
    output += String.fromCharCode((triple >> 16) & 255);
    if (c3 !== "=") output += String.fromCharCode((triple >> 8) & 255);
    if (c4 !== "=") output += String.fromCharCode(triple & 255);
  }

  return output;
};

const decodeJwtPayload = (token: string): { exp?: number } | null => {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  const payloadJson = decodeBase64(normalizeBase64Url(parts[1]));
  return JSON.parse(payloadJson);
};

type AuthResult = {
  success: boolean;
  message?: string;
  code?: string;
  retryAfter?: number;
};

export type AuthPhase =
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "error"
  | "locked";

type LastLoggedUser = {
  username: string;
  full_name: string;
  has_pin?: boolean;
};

type AuthSessionPayload = {
  access_token: string;
  refresh_token?: string | null;
  user: User;
  has_pin?: boolean;
  biometricPin?: string | null;
};

type PublicSessionResponse = {
  data?: {
    status?: "guest" | "authenticated";
    user?: {
      username?: string;
      role?: User["role"];
    } | null;
  };
};

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  isHydrated: boolean;
  authPhase: AuthPhase;
  hasValidToken: () => boolean;
  checkTokenExpired: (token: string) => boolean;
  startHeartbeat: () => void;
  stopHeartbeat: () => void;
  login: (
    username: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<AuthResult>;
  loginWithPin: (
    pin: string,
    username?: string,
  ) => Promise<AuthResult>;
  authenticateWithBiometrics: () => Promise<{
    success: boolean;
    message?: string;
  }>;
  savePinForBiometrics: (pin: string) => Promise<void>;
  getPinForBiometrics: () => Promise<string | null>;
  establishSession: (payload: AuthSessionPayload) => Promise<void>;
  waitForHydration: (timeoutMs?: number) => Promise<boolean>;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
  logoutAll: (
    username?: string,
  ) => Promise<AuthResult>;
  pinSetup: (
    pin: string,
    confirmPin: string,
  ) => Promise<AuthResult>;
  setLoading: (loading: boolean) => void;
  loadStoredAuth: () => Promise<void>;
  lastLoggedUser: LastLoggedUser | null;
  setLastLoggedUser: (user: LastLoggedUser | null) => void;
  clearLastLoggedUser: () => Promise<void>;
}

const AUTH_STORAGE_KEY = "auth_user";
const TOKEN_STORAGE_KEY = "auth_token";
const REFRESH_TOKEN_STORAGE_KEY = "refresh_token";
const BIOMETRIC_PIN_KEY = "biometric_pin";
const LAST_USER_STORAGE_KEY = "last_logged_user";

const log = createLogger("authStore");
let heartbeatInterval: NodeJS.Timeout | null = null;
const IS_TEST_ENV =
  process.env.NODE_ENV === "test" ||
  typeof process.env.JEST_WORKER_ID !== "undefined";
let apiClientPromise:
  | Promise<typeof import("../services/httpClient")["default"]>
  | null = null;
let localAuthenticationPromise:
  | Promise<typeof import("expo-local-authentication")>
  | null = null;

const getApiClient = async () => {
  if (!apiClientPromise) {
    apiClientPromise = IS_TEST_ENV
      ? Promise.resolve(
          (
            require("../services/httpClient") as typeof import("../services/httpClient")
          ).default,
        )
      : import("../services/httpClient").then((module) => module.default);
  }

  return apiClientPromise;
};

const getLocalAuthentication = async () => {
  if (!localAuthenticationPromise) {
    localAuthenticationPromise = IS_TEST_ENV
      ? Promise.resolve(
          require("expo-local-authentication") as typeof import("expo-local-authentication"),
        )
      : import("expo-local-authentication");
  }

  return localAuthenticationPromise;
};

const parseAuthError = (
  error: any,
  fallbackMessage: string,
  invalidCredentialsMessage = "Incorrect username or password",
): AuthResult => {
  const normalizedError = normalizeAuthApiError(error);
  const { status, code, message: apiMessage, retryAfter } = normalizedError;

  if (status === 409) {
    return {
      success: false,
      code: "AUTH_SESSION_CONFLICT",
      message:
        apiMessage ||
        "This account is already active on another device.",
    };
  }

  if (status === 401) {
    return {
      success: false,
      code: "AUTH_INVALID_CREDENTIALS",
      message: apiMessage || invalidCredentialsMessage,
    };
  }

  if (status === 400) {
    if (code === "USERNAME_REQUIRED_FOR_PIN_LOGIN") {
      return {
        success: false,
        code: "AUTH_USERNAME_REQUIRED_FOR_PIN_LOGIN",
        message:
          apiMessage ||
          "Sign in with username and password first, then use PIN login.",
      };
    }

    return {
      success: false,
      code: "AUTH_BAD_REQUEST",
      message: apiMessage || fallbackMessage,
    };
  }

  if (status === 422) {
    return {
      success: false,
      code: "AUTH_VALIDATION_ERROR",
      message: "Invalid login data. Please check username and password.",
    };
  }

  if (status === 403 && code === "NETWORK_NOT_ALLOWED") {
    return {
      success: false,
      code: "NETWORK_NOT_ALLOWED",
      message: "Network not allowed. Connect to the permitted network.",
    };
  }

  if (status === 403) {
    if (code === "ACCOUNT_DISABLED") {
      return {
        success: false,
        code: "ACCOUNT_DISABLED",
        message: apiMessage || "Account is deactivated. Please contact support.",
      };
    }

    return {
      success: false,
      code: "AUTH_ACCESS_DENIED",
      message: apiMessage || "Access denied",
    };
  }

  if (status === 429 || code === "RATE_LIMIT_ERROR") {
    return {
      success: false,
      code: "AUTH_RATE_LIMITED",
      message:
        apiMessage ||
        "Too many sign-in attempts. Please wait and try again.",
      retryAfter:
        typeof retryAfter === "number" ? retryAfter : undefined,
    };
  }

  if (error?.code === "ECONNABORTED") {
    return {
      success: false,
      code: "NETWORK_TIMEOUT",
      message: "Server timeout. Please check your connection and try again.",
    };
  }

  if (error?.request && !error?.response) {
    return {
      success: false,
      code: "NETWORK_CONNECTION_ERROR",
      message:
        "Unable to connect to server. Check internet connection and backend status.",
    };
  }

  if (typeof status === "number" && status >= 500) {
    return {
      success: false,
      code: "SERVER_ERROR",
      message: "Server error. Please try again in a moment.",
    };
  }

  return { success: false, message: apiMessage || fallbackMessage, code };
};

const hasAuthenticatedBrowserSession = (payload: unknown): boolean => {
  const session =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as PublicSessionResponse).data
      : null;

  if (session?.status !== "authenticated") {
    return false;
  }

  const role = session.user?.role;
  return (
    typeof session.user?.username === "string" &&
    (role === "staff" || role === "supervisor" || role === "admin")
  );
};

const buildLastLoggedUser = (
  user: User,
  hasPinOverride?: boolean,
): LastLoggedUser => ({
  username: user.username,
  full_name: user.full_name,
  has_pin: hasPinOverride ?? user.has_pin,
});

const resolveFailurePhase = (result: AuthResult): AuthPhase =>
  result.code === "AUTH_RATE_LIMITED" ? "locked" : "error";

const syncOfflineQueueInBackground = async () => {
  const { useNetworkStore } = IS_TEST_ENV
    ? (require("./networkStore") as typeof import("./networkStore"))
    : await import("./networkStore");
  const networkState = useNetworkStore.getState();
  if (!networkState.isOnline) return;

  const { syncOfflineQueue } = IS_TEST_ENV
    ? (require("../services/syncService") as typeof import("../services/syncService"))
    : await import("../services/syncService");
  syncOfflineQueue({ background: true }).catch((err) => {
    log.warn("Sync after auth failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
};

const initializeNotificationsInBackground = async () => {
  try {
    const { NotificationService } = IS_TEST_ENV
      ? (require("../services/utils/notificationService") as typeof import("../services/utils/notificationService"))
      : await import("../services/utils/notificationService");
    await NotificationService.initialize();
  } catch (error) {
    log.warn("Notification initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const unregisterNotificationsInBackground = async () => {
  try {
    const { NotificationService } = IS_TEST_ENV
      ? (require("../services/utils/notificationService") as typeof import("../services/utils/notificationService"))
      : await import("../services/utils/notificationService");
    await NotificationService.unregisterCurrentDevice();
  } catch (error) {
    log.warn("Notification unregister failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const rehydrateFilterStoreForCurrentScope = async () => {
  try {
    const { rehydrateFilterStore } = IS_TEST_ENV
      ? (require("./filterStore") as typeof import("./filterStore"))
      : await import("./filterStore");
    await rehydrateFilterStore();
  } catch (error) {
    log.warn("Filter store rehydration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const resetFilterStoreForLoggedOutUser = async () => {
  try {
    const { resetFilterStore } = IS_TEST_ENV
      ? (require("./filterStore") as typeof import("./filterStore"))
      : await import("./filterStore");
    await resetFilterStore();
  } catch (error) {
    log.warn("Filter store reset failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const hydrateAuthenticatedSession = async (
  user: User,
  options?: {
    syncOfflineQueue?: boolean;
  },
) => {
  setUserPreferenceScope(user.id);
  await rehydrateFilterStoreForCurrentScope();
  await useSettingsStore.getState().loadSettings();
  useAuthStore.getState().startHeartbeat();

  const postAuthTasks: Promise<unknown>[] = [
    useSettingsStore.getState().syncFromBackend(),
    initializeNotificationsInBackground(),
  ];

  if (options?.syncOfflineQueue !== false) {
    postAuthTasks.push(syncOfflineQueueInBackground());
  }

  const results = await Promise.allSettled(postAuthTasks);
  results.forEach((result) => {
    if (result.status === "rejected") {
      log.warn("Post-auth task failed", {
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  });
};

const hydrateAuthenticatedSessionInBackground = (
  user: User,
  options?: {
    syncOfflineQueue?: boolean;
  },
) => {
  void hydrateAuthenticatedSession(user, options).catch((error) => {
    log.warn("Authenticated session hydration failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  isHydrated: false,
  authPhase: "unauthenticated",
  lastLoggedUser: null,
  hasValidToken: (): boolean => {
    return !!get().user;
  },

  setLastLoggedUser: async (user: LastLoggedUser | null) => {
    set({ lastLoggedUser: user });
    if (user) {
      await secureStorage.setItem(LAST_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      await secureStorage.removeItem(LAST_USER_STORAGE_KEY);
    }
  },

  clearLastLoggedUser: async () => {
    await secureStorage.removeItem(LAST_USER_STORAGE_KEY);
    set({ lastLoggedUser: null });
  },

  establishSession: async ({
    access_token,
    refresh_token,
    user,
    has_pin,
    biometricPin,
  }: AuthSessionPayload) => {
    if (!access_token) {
      throw new Error("Invalid response format: missing access_token");
    }

    const apiClient = await getApiClient();
    const authenticatedUser =
      has_pin === undefined ? user : { ...user, has_pin };
    const lastUser = buildLastLoggedUser(authenticatedUser, has_pin);

    apiClient.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
    await secureStorage.setItem(TOKEN_STORAGE_KEY, access_token);

    if (refresh_token) {
      await secureStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refresh_token);
    } else {
      await secureStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }

    await secureStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify(authenticatedUser),
    );
    await secureStorage.setItem(
      LAST_USER_STORAGE_KEY,
      JSON.stringify(lastUser),
    );

    if (biometricPin) {
      await secureStorage.setItem(BIOMETRIC_PIN_KEY, biometricPin);
    }

    set({
      user: authenticatedUser,
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
      isHydrated: true,
      authPhase: "authenticated",
      lastLoggedUser: lastUser,
    });
    syncWebPublicSession({
      username: authenticatedUser.username,
      role: authenticatedUser.role,
    });

    hydrateAuthenticatedSessionInBackground(authenticatedUser);
  },

  waitForHydration: async (timeoutMs = 2000) => {
    if (get().isHydrated) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        resolve(useAuthStore.getState().isHydrated);
      }, timeoutMs);

      const unsubscribe = useAuthStore.subscribe((state) => {
        if (!state.isHydrated) {
          return;
        }

        clearTimeout(timeoutId);
        unsubscribe();
        resolve(true);
      });
    });
  },

  login: async (
    username: string,
    password: string,
    _rememberMe?: boolean,
  ): Promise<AuthResult> => {
    set({
      isLoading: true,
      isHydrated: false,
      authPhase: "authenticating",
    });
    try {
      const apiClient = await getApiClient();
      const response = await apiClient.post("/api/auth/login", {
        username,
        password,
      });

      if (response.data.success && response.data.data) {
        const { access_token, refresh_token, user } = response.data.data;
        if (!access_token) {
          log.error("Login successful but no access_token found in response", {
            dataKeys: Object.keys(response.data.data || {}),
          });
          throw new Error("Invalid response format: missing access_token");
        }
        await get().establishSession({ access_token, refresh_token, user });
        await get().waitForHydration();

        return { success: true };
      }

      const failureResult = {
        success: false,
        message: response.data.message || "Login failed",
      };
      set({
        isLoading: false,
        isHydrated: true,
        authPhase: resolveFailurePhase(failureResult),
      });
      return failureResult;
    } catch (_error: any) {
      const failureResult = parseAuthError(
        _error,
        "Login failed",
        "Incorrect username or password",
      );
      set({
        isLoading: false,
        isHydrated: true,
        authPhase: resolveFailurePhase(failureResult),
      });
      return failureResult;
    }
  },

  loginWithPin: async (
    pin: string,
    username?: string,
  ): Promise<AuthResult> => {
    set({
      isLoading: true,
      isHydrated: false,
      authPhase: "authenticating",
    });
    try {
      const apiClient = await getApiClient();
      const response = await apiClient.post("/api/auth/login-pin", {
        pin,
        username,
      });

      if (response.data.success && response.data.data) {
        const { access_token, refresh_token, user } = response.data.data;
        const settings = useSettingsStore.getState().settings;
        await get().establishSession({
          access_token,
          refresh_token,
          user,
          has_pin: true,
          biometricPin: settings.biometricAuth ? pin : null,
        });
        await get().waitForHydration();

        return { success: true };
      }

      const failureResult = {
        success: false,
        message: response.data.message || "Invalid PIN",
      };
      set({
        isLoading: false,
        isHydrated: true,
        authPhase: resolveFailurePhase(failureResult),
      });
      return failureResult;
    } catch (_error: any) {
      const failureResult = parseAuthError(
        _error,
        "PIN login failed",
        "Incorrect PIN",
      );
      set({
        isLoading: false,
        isHydrated: true,
        authPhase: resolveFailurePhase(failureResult),
      });
      return failureResult;
    }
  },

  authenticateWithBiometrics: async (): Promise<{
    success: boolean;
    message?: string;
  }> => {
    try {
      const LocalAuthentication = await getLocalAuthentication();
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        return {
          success: false,
          message: "Biometric authentication is not available on this device.",
        };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock with Biometrics",
        fallbackLabel: "Use PIN",
      });

      if (result.success) {
        const storedPin = await secureStorage.getItem(BIOMETRIC_PIN_KEY);
        if (storedPin) {
          return await get().loginWithPin(
            storedPin,
            get().lastLoggedUser?.username,
          );
        }
        return {
          success: false,
          message: "No PIN stored for biometric login.",
        };
      }

      return { success: false, message: "Authentication cancelled." };
    } catch (_error) {
      return { success: false, message: "Biometric authentication error." };
    }
  },

  savePinForBiometrics: async (pin: string) => {
    await secureStorage.setItem(BIOMETRIC_PIN_KEY, pin);
  },

  getPinForBiometrics: async () => {
    return await secureStorage.getItem(BIOMETRIC_PIN_KEY);
  },

  setUser: (user: User) => {
    secureStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    setUserPreferenceScope(user.id);
    void rehydrateFilterStoreForCurrentScope();
    void useSettingsStore.getState().loadSettings();
    syncWebPublicSession({
      username: user.username,
      role: user.role,
    });
    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      isHydrated: true,
      authPhase: "authenticated",
    });
  },

  logout: async () => {
    const apiClient = await getApiClient();

    try {
      get().stopHeartbeat();
    } catch (_) {}

    try {
      const refreshToken = await secureStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
      if (
        Platform.OS === "web" ||
        apiClient.defaults.headers.common["Authorization"] ||
        refreshToken
      ) {
        await apiClient
          .post("/api/auth/logout", refreshToken ? { refresh_token: refreshToken } : {})
          .catch(() => {});
      }
    } catch (_) {}

    try {
      await unregisterNotificationsInBackground();
    } catch (error) {
      log.warn("Notifications unregister failed during logout", {
        error: String(error),
      });
    }
    
    // Clear state early to ensure synchronous UI unmounts and Auth Guards redirect properly
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: false,
      authPhase: "unauthenticated",
    });
    syncWebPublicSession(null);

    try {
      await secureStorage.removeItem(AUTH_STORAGE_KEY);
      await secureStorage.removeItem(TOKEN_STORAGE_KEY);
      await secureStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      await secureStorage.removeItem(BIOMETRIC_PIN_KEY);
      delete apiClient.defaults.headers.common["Authorization"];
    } catch (err) {
      log.warn("Storage cleanup failed during logout", {
        error: String(err),
      });
    }

    try {
      setUserPreferenceScope(null);
      await resetFilterStoreForLoggedOutUser();
      await useSettingsStore.getState().loadSettings();
    } catch (_) {}

    try {
      const { clearNotificationStore } = IS_TEST_ENV
        ? (require("./notificationStore") as typeof import("./notificationStore"))
        : await import("./notificationStore");
      await clearNotificationStore();
    } catch {
      // Best-effort; never block logout.
    }

    try {
      const { queryClient } = IS_TEST_ENV
        ? (require("../services/queryClient") as typeof import("../services/queryClient"))
        : await import("../services/queryClient");
      await queryClient.cancelQueries();
      queryClient.clear();
    } catch {
      // Best-effort; never block logout.
    }

    try {
      const { clearScanSessionStore } = IS_TEST_ENV
        ? (require("./scanSessionStore") as typeof import("./scanSessionStore"))
        : await import("./scanSessionStore");
      await clearScanSessionStore();
    } catch {
      // Best-effort; never block logout.
    }

    try {
      const { RecentItemsService } = IS_TEST_ENV
        ? (require("../services/enhancedFeatures") as typeof import("../services/enhancedFeatures"))
        : await import("../services/enhancedFeatures");
      await RecentItemsService.clearRecent();
    } catch {
      // Best-effort; never block logout.
    }

    try {
      const { clearAllCache } = IS_TEST_ENV
        ? (require("../services/offline/offlineStorage") as typeof import("../services/offline/offlineStorage"))
        : await import("../services/offline/offlineStorage");
      await clearAllCache();
    } catch {
      // Best-effort; never block logout.
    }

    set({
      isHydrated: true,
      authPhase: "unauthenticated",
    });
  },

  logoutAll: async (
    _username?: string,
  ): Promise<AuthResult> => {
    set({ isLoading: true });
    try {
      const apiClient = await getApiClient();
      // Backend uses JWT current_user, no body needed
      const response = await apiClient.post("/api/sessions/logout-all");
      set({ isLoading: false });
      return { success: response.data.success, message: response.data.message };
    } catch (_error) {
      set({ isLoading: false });
      return { success: false, message: "Logout All failed" };
    }
  },

  pinSetup: async (
    pin: string,
    confirmPin: string,
  ): Promise<AuthResult> => {
    set({ isLoading: true });
    try {
      const apiClient = await getApiClient();
      const response = await apiClient.post("/api/auth/pin-setup", {
        pin,
        confirm_pin: confirmPin,
      });
      set({ isLoading: false });
      if (response.data.success) {
        // Persist biometric PIN only when biometric auth is enabled.
        const settings = useSettingsStore.getState().settings;
        if (settings.biometricAuth) {
          await secureStorage.setItem(BIOMETRIC_PIN_KEY, pin);
        }

        // Mark last logged user as PIN-enabled so PIN login mode is available next launch.
        const currentUser = get().user;
        const lastUser = get().lastLoggedUser;
        if (currentUser) {
          const updatedLastUser = {
            username: currentUser.username,
            full_name: currentUser.full_name,
            has_pin: true,
          };
          await secureStorage.setItem(
            LAST_USER_STORAGE_KEY,
            JSON.stringify(updatedLastUser),
          );
          set({
            lastLoggedUser: updatedLastUser,
            user: { ...currentUser, has_pin: true },
          });
        } else if (lastUser) {
          const updatedLastUser = { ...lastUser, has_pin: true };
          await secureStorage.setItem(
            LAST_USER_STORAGE_KEY,
            JSON.stringify(updatedLastUser),
          );
          set({ lastLoggedUser: updatedLastUser });
        }
        return { success: true, message: "PIN updated" };
      }
      return {
        success: false,
        message: response.data.message || "PIN setup failed",
      };
    } catch (_error: any) {
      set({ isLoading: false });
      const detail = _error?.response?.data?.detail;
      return {
        success: false,
        message: detail?.message || "Server error during PIN setup",
      };
    }
  },

  setLoading: (loading: boolean) => set({ isLoading: loading }),

  // Helper function to check if JWT token is expired
  checkTokenExpired: (token: string): boolean => {
    try {
      const payload = decodeJwtPayload(token);
      // If we can't decode/parse, treat it as expired so we don't keep a broken
      // auth session alive and end up in refresh/401 loops.
      if (!payload || typeof payload.exp !== "number") return true;

      const now = Math.floor(Date.now() / 1000);

      return payload.exp <= now;
    } catch {
      return true;
    }
  },

  loadStoredAuth: async () => {
    if (get().isInitialized) return;

    set({ isLoading: true, isHydrated: false });
    try {
      const apiClient = await getApiClient();
      const storedUser = await secureStorage.getItem(AUTH_STORAGE_KEY);
      const storedToken = await secureStorage.getItem(TOKEN_STORAGE_KEY);
      const storedLastUser = await secureStorage.getItem(LAST_USER_STORAGE_KEY);

      if (storedLastUser) {
        set({ lastLoggedUser: JSON.parse(storedLastUser) });
      }

      if (storedUser && storedToken) {
        // Check if token is expired
        const isExpired = get().checkTokenExpired(storedToken);
        if (isExpired) {
          log.warn("Stored token is expired, clearing auth state");
          await get().logout();
          set({
            isLoading: false,
            isInitialized: true,
            isHydrated: true,
            authPhase: "unauthenticated",
          });
          return;
        }

        const user = JSON.parse(storedUser) as User;
        apiClient.defaults.headers.common["Authorization"] =
          `Bearer ${storedToken}`;
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
          isHydrated: true,
          authPhase: "authenticated",
        });
        syncWebPublicSession({
          username: user.username,
          role: user.role,
        });
        hydrateAuthenticatedSessionInBackground(user, {
          syncOfflineQueue: false,
        });
      } else if (Platform.OS === "web") {
        try {
          const sessionResponse = await apiClient.get("/api/auth/public-session");
          if (hasAuthenticatedBrowserSession(sessionResponse.data)) {
            const response = await apiClient.get("/api/auth/me");
            const payload =
              response.data && typeof response.data === "object" && "data" in response.data
                ? (response.data as { data?: User }).data
                : (response.data as User | null);

            if (payload?.username) {
              await secureStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
              set({
                user: payload,
                isAuthenticated: true,
                isLoading: false,
                isInitialized: true,
                isHydrated: true,
                authPhase: "authenticated",
              });
              syncWebPublicSession({
                username: payload.username,
                role: payload.role,
              });
              hydrateAuthenticatedSessionInBackground(payload, {
                syncOfflineQueue: false,
              });
              return;
            }
          }
        } catch (_cookieAuthError) {
          // No active browser session; continue to unauthenticated state.
        }

        syncWebPublicSession(null);
        set({
          isLoading: false,
          isInitialized: true,
          isHydrated: true,
          authPhase: "unauthenticated",
        });
      } else {
        set({
          isLoading: false,
          isInitialized: true,
          isHydrated: true,
          authPhase: "unauthenticated",
        });
      }
    } catch (_error) {
      if (Platform.OS === "web") {
        syncWebPublicSession(null);
      }
      set({
        isLoading: false,
        isInitialized: true,
        isHydrated: true,
        authPhase: "error",
      });
    }
  },

  startHeartbeat: () => {
    if (heartbeatInterval) return;

    let consecutiveFailures = 0;
    const MAX_FAILURES = 3; // Allow 3 failures before logout

    heartbeatInterval = setInterval(async () => {
      if (!get().isAuthenticated) {
        get().stopHeartbeat();
        return;
      }

      try {
        const apiClient = await getApiClient();
        const response = await apiClient.get("/api/auth/heartbeat");
        consecutiveFailures = 0; // Reset on success

        if (
          response.data.success === false ||
          (response.data.data && response.data.data.session_valid === false)
        ) {
          await get().logout();
        }
      } catch (error) {
        consecutiveFailures++;
        log.warn("Heartbeat failed", {
          failureCount: consecutiveFailures,
          error: error instanceof Error ? error.message : String(error),
        });

        // Only logout after multiple consecutive failures
        if (consecutiveFailures >= MAX_FAILURES) {
          log.error("Heartbeat failed multiple times, logging out");
          await get().logout();
        }
      }
    }, 45000); // 45 seconds — must be shorter than backend rack lock TTL (60s)
  },

  stopHeartbeat: () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  },
}));

setUnauthorizedHandler(() => {
  void useAuthStore.getState().logout();
});
