import React from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import AppShell from "@/bootstrap/AppShell";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { fontAssets } from "@/constants/fontAssets";
import { initializeApp } from "@/bootstrap/initApp";
import { BootLoadingView } from "@/bootstrap/BootStateViews";
import { zIndex } from "@/theme";

const WebAppShell = Platform.OS === "web" ? AppShell : null;
const LazyAppShell = React.lazy(() => import("@/bootstrap/AppShell"));

const BOOT_PROGRESS_READY_THRESHOLD = 80;
const BOOT_PROGRESS_CHECK_MS = 2000;
const BOOT_PROGRESS_STALL_MS = 4500;
const BOOT_HARD_TIMEOUT_MS = 14000;
const BOOT_RETRY_DELAYS_MS = [2000, 4000] as const;
const SPLASH_FADE_MS = 300;

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
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  const [isInitialized, setIsInitialized] = React.useState(false);
  const [initError, setInitError] = React.useState<string | null>(null);
  const [initProgress, setInitProgress] = React.useState(1);
  const [initStatus, setInitStatus] = React.useState("Preparing secure runtime");
  const [bootAttempt, setBootAttempt] = React.useState(0);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [showBootOverlay, setShowBootOverlay] = React.useState(!isWeb);
  const bootOpacity = React.useRef(new Animated.Value(1)).current;
  const cleanupRef = React.useRef<(() => void)[]>([]);
  const progressRef = React.useRef(1);
  const lastProgressAtRef = React.useRef(Date.now());
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (fontError && __DEV__) {
      console.warn("Font loading failed; continuing with fallback fonts", fontError);
    }
  }, [fontError]);

  const handleRetryInitialization = React.useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setBootAttempt((attempt) => attempt + 1);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let completed = false;
    const startedAt = Date.now();

    progressRef.current = 1;
    lastProgressAtRef.current = startedAt;
    setInitProgress(1);
    setInitStatus(bootAttempt > 0 ? "Retrying startup" : "Preparing secure runtime");
    setInitError(null);
    setIsRetrying(bootAttempt > 0);

    if (!isWeb) {
      bootOpacity.setValue(1);
      setShowBootOverlay(true);
    }

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const hideNativeSplash = async (): Promise<void> => {
      if (isWeb) {
        return;
      }

      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        if (__DEV__) {
          console.warn("Splash screen hide failed:", error);
        }
      }
    };

    const fadeBootOverlay = (): void => {
      if (isWeb) {
        return;
      }

      Animated.timing(bootOpacity, {
        toValue: 0,
        duration: SPLASH_FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) {
          setShowBootOverlay(false);
        }
      });
    };

    let adaptiveCheck: ReturnType<typeof setInterval> | null = null;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearBootTimers = (): void => {
      if (adaptiveCheck) {
        clearInterval(adaptiveCheck);
        adaptiveCheck = null;
      }
      if (hardTimeout) {
        clearTimeout(hardTimeout);
        hardTimeout = null;
      }
    };

    const completeInitialization = async (): Promise<void> => {
      if (cancelled || completed) {
        return;
      }

      completed = true;
      clearBootTimers();
      setInitProgress(100);
      setInitStatus("Opening workspace");
      setIsRetrying(false);
      useAuthStore.getState().setLoading(false);
      useAuthStore.setState({ isInitialized: true });
      setIsInitialized(true);
      setInitError(null);

      await hideNativeSplash();
      fadeBootOverlay();

      if (__DEV__) {
        console.log("✅ [INIT] Initialization completed successfully");
      }
    };

    const forceRenderAfterStall = (message: string): void => {
      if (cancelled || completed) {
        return;
      }

      completed = true;
      clearBootTimers();
      console.warn(message);
      useAuthStore.getState().setLoading(false);
      useAuthStore.setState({ isInitialized: true });
      setInitProgress((progress) => Math.max(progress, 85));
      setInitStatus("Continuing with cached startup state");
      setInitError(message);
      setIsRetrying(false);
      setIsInitialized(true);
      void hideNativeSplash().then(fadeBootOverlay);
    };

    adaptiveCheck = setInterval(() => {
      if (progressRef.current >= BOOT_PROGRESS_READY_THRESHOLD) {
        return;
      }

      const now = Date.now();
      const stalledMs = now - lastProgressAtRef.current;
      const elapsedMs = now - startedAt;
      if (elapsedMs >= BOOT_PROGRESS_CHECK_MS && stalledMs >= BOOT_PROGRESS_STALL_MS) {
        forceRenderAfterStall(
          "Startup is taking longer than expected. Continuing while background services recover."
        );
      }
    }, BOOT_PROGRESS_CHECK_MS);

    hardTimeout = setTimeout(() => {
      forceRenderAfterStall(
        "Startup timed out. Continuing with cached data while background services recover."
      );
    }, BOOT_HARD_TIMEOUT_MS);

    const initialize = async (): Promise<void> => {
      try {
        const { cleanup } = await initializeApp({
          fontsLoaded,
          isDev: __DEV__,
          loadStoredAuth,
          loadSettings,
          deferUnauthenticatedSettings: isWeb,
          onProgress: ({ progress, message }) => {
            if (cancelled || completed) {
              return;
            }

            const nextProgress = Math.max(progressRef.current, progress);
            progressRef.current = nextProgress;
            lastProgressAtRef.current = Date.now();
            setInitProgress(nextProgress);
            setInitStatus(message);
          },
        });
        if (cancelled) {
          cleanup();
          return;
        }
        cleanupRef.current.push(cleanup);
        await completeInitialization();
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        if (completed) {
          return;
        }

        completed = true;
        clearBootTimers();
        const err = error instanceof Error ? error : new Error(String(error));
        const errorMessage = err.message || String(error);

        if (__DEV__) {
          console.error("❌ Initialization error:", err);
        } else {
          import("@/services/sentry")
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
        setInitProgress((progress) => Math.max(progress, 8));
        setInitStatus("Startup needs attention");
        useAuthStore.getState().setLoading(false);
        setIsRetrying(false);

        if (!isWeb) {
          await SplashScreen.hideAsync();
        }

        if (bootAttempt < BOOT_RETRY_DELAYS_MS.length) {
          const retryDelay = BOOT_RETRY_DELAYS_MS[bootAttempt];
          if (typeof retryDelay !== "number") {
            return;
          }
          setInitStatus(`Retrying startup in ${Math.round(retryDelay / 1000)} seconds`);
          setIsRetrying(true);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            setBootAttempt((attempt) => attempt + 1);
          }, retryDelay);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      clearBootTimers();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
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
  }, [bootAttempt]);

  // Web protected routes already gate themselves on auth state, so the shell
  // can mount immediately and public pages do not wait on full boot completion.
  const shouldBlockRender = !isWeb && (!isInitialized || isLoading);
  const bootLoadingView = (
    <BootLoadingView
      initError={initError}
      progress={initProgress}
      statusMessage={initStatus}
      isRetrying={isRetrying}
      onRetry={handleRetryInitialization}
    />
  );

  if (shouldBlockRender) {
    return bootLoadingView;
  }

  const appShell =
    isWeb && WebAppShell ? (
      <WebAppShell />
    ) : (
      <React.Suspense fallback={bootLoadingView}>
        <LazyAppShell />
      </React.Suspense>
    );

  if (isWeb && WebAppShell) {
    return appShell;
  }

  if (!showBootOverlay) {
    return appShell;
  }

  return (
    <View style={styles.root}>
      {appShell}
      <Animated.View pointerEvents="none" style={[styles.bootOverlay, { opacity: bootOpacity }]}>
        <BootLoadingView
          initError={null}
          progress={Math.max(initProgress, 95)}
          statusMessage="Opening workspace"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bootOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: zIndex.toast,
  },
});
