import { mmkvStorage } from "../services/mmkvStorage";
import { withTimeout } from "./withTimeout";
import { initMonitoringAndDevTools } from "./initDevTools";
import { initAuthAndSettings } from "./initAuthAndSettings";
import { initMobileRuntime } from "./initMobileRuntime";
import { installWebAlertShim } from "./installWebAlertShim";
import { createLogger } from "../services/logging";
import { useAuthStore } from "../store/authStore";

const log = createLogger("initApp");

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface InitializeAppOptions {
  fontsLoaded: boolean;
  isDev: boolean;
  loadStoredAuth: () => Promise<void>;
  loadSettings: () => Promise<void>;
  isAuthenticated?: () => boolean;
  deferUnauthenticatedSettings?: boolean;
  onProgress?: (progress: InitializeAppProgress) => void;
}

export interface InitializeAppResult {
  cleanup: () => void;
}

export type InitializeAppProgressPhase =
  | "monitoring"
  | "fonts"
  | "storage"
  | "auth"
  | "settings"
  | "deferred-services"
  | "runtime"
  | "ready";

export interface InitializeAppProgress {
  phase: InitializeAppProgressPhase;
  progress: number;
  message: string;
}

const createProgressReporter = (onProgress: InitializeAppOptions["onProgress"]) => {
  let currentProgress = 0;

  return (progress: InitializeAppProgress) => {
    if (!onProgress) {
      return;
    }

    const nextProgress = Math.max(currentProgress, Math.max(0, Math.min(100, progress.progress)));
    currentProgress = nextProgress;

    onProgress({
      ...progress,
      progress: nextProgress,
    });
  };
};

export async function initializeApp(options: InitializeAppOptions): Promise<InitializeAppResult> {
  const {
    fontsLoaded,
    isDev,
    loadStoredAuth,
    loadSettings,
    isAuthenticated: isAuthenticatedOverride,
    deferUnauthenticatedSettings = false,
    onProgress,
  } = options;
  const reportProgress = createProgressReporter(onProgress);

  installWebAlertShim();

  reportProgress({
    phase: "monitoring",
    progress: 5,
    message: "Preparing secure runtime",
  });
  initMonitoringAndDevTools(isDev);

  if (!fontsLoaded && isDev) {
    log.warn("Fonts not loaded yet; continuing with fallback fonts");
  }
  reportProgress({
    phase: "fonts",
    progress: fontsLoaded ? 15 : 10,
    message: fontsLoaded ? "Fonts ready" : "Using fallback fonts while assets finish loading",
  });

  try {
    reportProgress({
      phase: "storage",
      progress: 20,
      message: "Opening local secure storage",
    });
    await withTimeout(mmkvStorage.initialize(), 2000, "MMKV initialization timeout");
  } catch (e) {
    log.warn("MMKV initialization failed or timed out", {
      error: describeError(e),
    });
  }
  reportProgress({
    phase: "storage",
    progress: 30,
    message: "Local storage ready",
  });

  reportProgress({
    phase: "auth",
    progress: 40,
    message: "Restoring saved session",
  });
  const authAndSettingsResult = await initAuthAndSettings(loadStoredAuth, loadSettings, {
    deferUnauthenticatedSettings,
  });

  const { authResult, settingsResult } = authAndSettingsResult;
  if (authResult.status === "rejected" && isDev) {
    log.warn("Auth loading failed", {
      error: describeError(authResult.reason),
    });
  }
  if (settingsResult.status === "rejected" && isDev) {
    log.warn("Settings loading failed", {
      error: describeError(settingsResult.reason),
    });
  }
  reportProgress({
    phase: "settings",
    progress: 70,
    message: "Session and settings checked",
  });

  const isAuthenticated = isAuthenticatedOverride?.() ?? useAuthStore.getState().isAuthenticated;

  void (async () => {
    const themeResult = (
      await Promise.allSettled([
        withTimeout(
          import("../services/themeService").then(({ ThemeService }) => ThemeService.initialize()),
          1000,
          "Theme initialization timeout"
        ),
      ])
    )[0] as PromiseSettledResult<void>;

    if (themeResult.status === "rejected" && isDev) {
      log.warn("Theme initialization failed", {
        error: describeError(themeResult.reason),
      });
    }
  })();
  reportProgress({
    phase: "deferred-services",
    progress: 82,
    message: "Deferred services scheduled",
  });

  void (async () => {
    if (!isAuthenticated) {
      return;
    }

    const syncResult = (
      await Promise.allSettled([
        withTimeout(
          import("../services/backgroundSync").then(({ registerBackgroundSync }) =>
            registerBackgroundSync()
          ),
          1000,
          "Background sync timeout"
        ),
      ])
    )[0] as PromiseSettledResult<void>;

    if (syncResult.status === "rejected" && isDev) {
      log.warn("Background sync failed", {
        error: describeError(syncResult.reason),
      });
    }
  })();
  reportProgress({
    phase: "runtime",
    progress: 90,
    message: "Starting mobile runtime",
  });

  let runtimeCleanup = () => {};
  let runtimeDisposed = false;

  void initMobileRuntime(isDev)
    .then((cleanup) => {
      if (runtimeDisposed) {
        cleanup();
        return;
      }
      runtimeCleanup = cleanup;
    })
    .catch((error) => {
      if (isDev) {
        log.warn("Mobile runtime initialization failed", {
          error: describeError(error),
        });
      }
    });

  const cleanup = () => {
    runtimeDisposed = true;
    runtimeCleanup();
  };
  reportProgress({
    phase: "ready",
    progress: 100,
    message: "Ready",
  });
  return { cleanup };
}
