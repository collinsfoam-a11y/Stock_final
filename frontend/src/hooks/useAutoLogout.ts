import { useEffect, useRef, useCallback } from "react";
import { AppState, Alert } from "react-native";
import { useAuthStore } from "../store/authStore";

const DEFAULT_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_LEAD_MS = 2 * 60 * 1000; // 2 minutes

export const useAutoLogout = (
  enabled: boolean = true,
  timeoutMs: number = DEFAULT_INACTIVITY_TIMEOUT,
) => {
  const { logout, user } = useAuthStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutDuration = Math.max(60 * 1000, timeoutMs);
  const warningDelay = Math.max(
    0,
    timeoutDuration - Math.min(WARNING_LEAD_MS, Math.round(timeoutDuration / 4)),
  );

  const resetTimer = useCallback(() => {
    if (!enabled || !user) return;

    lastActivityRef.current = Date.now();

    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    // Set warning timer (2 minutes before logout)
    if (warningDelay > 0) {
      warningTimeoutRef.current = setTimeout(() => {
        Alert.alert(
          "Session Expiring",
          "Your session will expire soon due to inactivity. Tap OK to continue.",
          [
            {
              text: "OK",
              onPress: () => resetTimer(),
            },
          ],
          { cancelable: false },
        );
      }, warningDelay);
    }

    // Set auto logout timer
    timeoutRef.current = setTimeout(() => {
      Alert.alert(
        "Session Expired",
        "You have been logged out due to inactivity.",
        [
          {
            text: "OK",
            onPress: async () => {
              await logout();
            },
          },
        ],
        { cancelable: false },
      );
    }, timeoutDuration);
  }, [enabled, logout, timeoutDuration, user, warningDelay]);

  useEffect(() => {
    if (!enabled || !user) return;

    // Start timer
    resetTimer();

    // Track app state changes
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        // Check if timeout exceeded while app was in background
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed > timeoutDuration) {
          void logout();
        } else {
          resetTimer();
        }
      }
    });

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      subscription.remove();
    };
  }, [enabled, logout, resetTimer, timeoutDuration, user]);

  return { resetTimer };
};
