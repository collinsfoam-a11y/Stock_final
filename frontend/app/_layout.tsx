import React from "react";
import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import AppShell from "../src/bootstrap/AppShell";
import { useAuthStore } from "../src/store/authStore";
import { useSettingsStore } from "../src/store/settingsStore";
import { fontAssets } from "../src/constants/fontAssets";
import { initializeApp } from "../src/bootstrap/initApp";
import { BootLoadingView } from "../src/bootstrap/BootStateViews";


const WebAppShell =
  Platform.OS === "web"
    ? AppShell
    : null;
const LazyAppShell = React.lazy(() => import("../src/bootstrap/AppShell"));

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

if (__DEV__) {
  console.log("🌐 [DEV] _layout.tsx module loaded, Platform:", Platform.OS);
}

export default function RootLayout() {
  const isWeb = Platform.OS === "web";
  const isLoading = useAuthStore((state) => state.isLoading);
  const loadStoredAuth = useAuthStore((state) => state.loadStoredAuth);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const [fontsLoaded] = useFonts(fontAssets);

  const [isInitialized, setIsInitialized] = React.useState(false);
  const [initError, setInitError] = React.useState<string | null>(null);
  const cleanupRef = React.useRef<(() => void)[]>([]);

  React.useEffect(() => {
    const maxTimeout = setTimeout(() => {
      console.warn(
        "⚠️ Maximum initialization timeout reached - forcing app to render",
      );
      useAuthStore.getState().setLoading(false);
      useAuthStore.setState({ isInitialized: true });
      setIsInitialized(true);
    }, 10000);

    const initialize = async (): Promise<void> => {
      try {
        const { cleanup } = await initializeApp({
          fontsLoaded,
          isDev: __DEV__,
          loadStoredAuth,
          loadSettings,
          deferUnauthenticatedSettings: isWeb,
        });
        cleanupRef.current.push(cleanup);

        clearTimeout(maxTimeout);
        useAuthStore.getState().setLoading(false);
        useAuthStore.setState({ isInitialized: true });
        setIsInitialized(true);
        setInitError(null);

        if (__DEV__) {
          console.log("✅ [INIT] Initialization completed successfully");
        }
        if (!isWeb) {
          await SplashScreen.hideAsync();
        }
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        const errorMessage = err.message || String(error);

        if (__DEV__) {
          console.error("❌ Initialization error:", err);
        } else {
          import("../src/services/sentry")
            .then(({ captureException }) => {
              captureException(err as Error, {
                context: "App initialization",
                message: errorMessage,
              });
            })
            .catch(() => {
              console.error("App initialization failed:", errorMessage);
            });
        }

        setInitError(errorMessage);
        clearTimeout(maxTimeout);
        useAuthStore.getState().setLoading(false);
        setIsInitialized(true);

        if (!isWeb) {
          await SplashScreen.hideAsync();
        }
      }
    };

    initialize();

    return () => {
      clearTimeout(maxTimeout);
      cleanupRef.current.forEach((fn) => {
        try {
          fn();
        } catch (cleanupError) {
          console.warn("Cleanup error:", cleanupError);
        }
      });
      cleanupRef.current = [];
    };
    // The store functions are stable but lint cannot verify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web protected routes already gate themselves on auth state, so the shell
  // can mount immediately and public pages do not wait on full boot completion.
  const shouldBlockRender = !isWeb && (!isInitialized || isLoading);

  if (shouldBlockRender) {
    return <BootLoadingView initError={initError} />;
  }

  if (isWeb && WebAppShell) {
    return <WebAppShell />;
  }

  return (
    <React.Suspense fallback={<BootLoadingView initError={initError} />}>
      <LazyAppShell />
    </React.Suspense>
  );
}
