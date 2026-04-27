import { mmkvStorage } from "../services/mmkvStorage";
import { withTimeout } from "./withTimeout";
import { initMonitoringAndDevTools } from "./initDevTools";
import { initAuthAndSettings } from "./initAuthAndSettings";
import { initMobileRuntime } from "./initMobileRuntime";
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
}

export interface InitializeAppResult {
  cleanup: () => void;
}

export async function initializeApp(
  options: InitializeAppOptions,
): Promise<InitializeAppResult> {
  const {
    fontsLoaded,
    isDev,
    loadStoredAuth,
    loadSettings,
    isAuthenticated: isAuthenticatedOverride,
    deferUnauthenticatedSettings = false,
  } = options;

  initMonitoringAndDevTools(isDev);

  if (!fontsLoaded && isDev) {
    log.warn("Fonts not loaded yet; continuing with fallback fonts");
  }

  try {
    await withTimeout(
      mmkvStorage.initialize(),
      2000,
      "MMKV initialization timeout",
    );
  } catch (e) {
    log.warn("MMKV initialization failed or timed out", {
      error: describeError(e),
    });
  }

  const authAndSettingsResult = await initAuthAndSettings(
    loadStoredAuth,
    loadSettings,
    { deferUnauthenticatedSettings },
  );

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

  const isAuthenticated =
    isAuthenticatedOverride?.() ?? useAuthStore.getState().isAuthenticated;

  void (async () => {
    const themeResult = (await Promise.allSettled([
      withTimeout(
        import("../services/themeService").then(({ ThemeService }) =>
          ThemeService.initialize(),
        ),
        1000,
        "Theme initialization timeout",
      ),
    ]))[0] as PromiseSettledResult<void>;

    if (themeResult.status === "rejected" && isDev) {
      log.warn("Theme initialization failed", {
        error: describeError(themeResult.reason),
      });
    }
  })();

  void (async () => {
    if (!isAuthenticated) {
      return;
    }

    const syncResult = (await Promise.allSettled([
      withTimeout(
        import("../services/backgroundSync").then(
          ({ registerBackgroundSync }) => registerBackgroundSync(),
        ),
        1000,
        "Background sync timeout",
      ),
    ]))[0] as PromiseSettledResult<void>;

    if (syncResult.status === "rejected" && isDev) {
      log.warn("Background sync failed", {
        error: describeError(syncResult.reason),
      });
    }
  })();

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
  return { cleanup };
}
