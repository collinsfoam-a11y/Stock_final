import React from "react";
import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import "react-native-reanimated";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../src/store/authStore";
import { useSettingsStore } from "../src/store/settingsStore";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { ToastProvider } from "../src/components/feedback/ToastProvider";
import { ThemeProvider } from "../src/context/ThemeContext";
import { queryClient } from "../src/services/queryClient";
import { AuthGuard } from "../src/components/auth/AuthGuard";
import { fontAssets } from "../src/constants/fontAssets";
import { initializeApp } from "../src/bootstrap/initApp";
import { RootStack } from "../src/bootstrap/RootStack";
import { BootErrorView, BootLoadingView } from "../src/bootstrap/BootStateViews";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

if (__DEV__) {
  console.log("🌐 [DEV] _layout.tsx module loaded, Platform:", Platform.OS);
}

export default function RootLayout() {
  const { isLoading, loadStoredAuth } = useAuthStore();
  const { loadSettings } = useSettingsStore();
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
        if (Platform.OS !== "web") {
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

        if (Platform.OS !== "web") {
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

  if (!isInitialized || isLoading) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BootLoadingView initError={initError} />
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  if (isInitialized && initError && Platform.OS === "web") {
    return <BootErrorView initError={initError} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <AuthGuard>
              <RootStack />
            </AuthGuard>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

