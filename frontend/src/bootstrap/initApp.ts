import { mmkvStorage } from "../services/mmkvStorage";
import { withTimeout } from "./withTimeout";
import { initMonitoringAndDevTools } from "./initDevTools";
import { initAuthAndSettings } from "./initAuthAndSettings";
import { initMobileRuntime } from "./initMobileRuntime";
import { useAuthStore } from "../store/authStore";

export interface InitializeAppOptions {
  fontsLoaded: boolean;
  isDev: boolean;
  loadStoredAuth: () => Promise<void>;
  loadSettings: () => Promise<void>;
  isAuthenticated?: () => boolean;
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
  } = options;

  initMonitoringAndDevTools(isDev);

  if (!fontsLoaded && isDev) {
    console.warn("Fonts not loaded yet; continuing bootstrap with fallback fonts");
  }

  try {
    await withTimeout(
      mmkvStorage.initialize(),
      2000,
      "MMKV initialization timeout",
    );
  } catch (e) {
    console.warn("MMKV initialization failed or timed out:", e);
  }

  const [authAndSettingsResult, themeResult] = await Promise.allSettled([
    initAuthAndSettings(loadStoredAuth, loadSettings),
    withTimeout(
      import("../services/themeService").then(({ ThemeService }) =>
        ThemeService.initialize(),
      ),
      1000,
      "Theme initialization timeout",
    ),
  ]);

  let syncResult: PromiseSettledResult<void> | null = null;

  const isAuthenticated =
    isAuthenticatedOverride?.() ?? useAuthStore.getState().isAuthenticated;
  if (isAuthenticated) {
    syncResult = (await Promise.allSettled([
      withTimeout(
        import("../services/backgroundSync").then(
          ({ registerBackgroundSync }) => registerBackgroundSync(),
        ),
        1000,
        "Background sync timeout",
      ),
    ]))[0] as PromiseSettledResult<void>;
  }

  if (authAndSettingsResult.status === "rejected") {
    if (isDev) {
      console.warn("Auth/settings initialization failed:", authAndSettingsResult.reason);
    }
  } else {
    const { authResult, settingsResult } = authAndSettingsResult.value;
    if (authResult.status === "rejected" && isDev) {
      console.warn("Auth loading failed:", authResult.reason);
    }
    if (settingsResult.status === "rejected" && isDev) {
      console.warn("Settings loading failed:", settingsResult.reason);
    }
  }

  if (syncResult?.status === "rejected" && isDev) {
    console.warn("Background sync failed:", syncResult.reason);
  }
  if (themeResult.status === "rejected" && isDev) {
    console.warn("Theme initialization failed:", themeResult.reason);
  }

  const cleanup = await initMobileRuntime(isDev);
  return { cleanup };
}
