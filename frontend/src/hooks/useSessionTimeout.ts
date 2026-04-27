import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuthStore } from "../store/authStore";
import { createLogger } from "../services/logging";

const log = createLogger("useSessionTimeout");

const SESSION_TIMEOUT_WARNING_MS = 5 * 60 * 1000; // 5 minutes before expiry

interface SessionTimeoutState {
  showWarning: boolean;
  secondsRemaining: number;
  timeUntilExpiry: number;
}

export interface UseSessionTimeoutReturn {
  showWarning: boolean;
  secondsRemaining: number;
  dismissWarning: () => void;
  refreshSession: () => void;
}

function decodeJwtExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp || null;
  } catch {
    return null;
  }
}

async function getStoredToken(): Promise<string | null> {
  try {
    const { secureStorage } = await import("../services/storage/secureStorage");
    return await secureStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

export function useSessionTimeout(): UseSessionTimeoutReturn {
  const [state, setState] = useState<SessionTimeoutState>({
    showWarning: false,
    secondsRemaining: 0,
    timeUntilExpiry: 0,
  });

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCountdown = useCallback((timeRemaining: number) => {
    clearTimers();

    countdownRef.current = setInterval(() => {
      setState((prev) => {
        const newRemaining = prev.secondsRemaining - 1;
        if (newRemaining <= 0) {
          clearTimers();
          return {
            ...prev,
            showWarning: false,
            secondsRemaining: 0,
          };
        }
        return {
          ...prev,
          secondsRemaining: newRemaining,
          timeUntilExpiry: newRemaining * 1000,
        };
      });
    }, 1000);

    setState((prev) => ({
      ...prev,
      secondsRemaining: Math.floor(timeRemaining / 1000),
      timeUntilExpiry: timeRemaining,
    }));
  }, [clearTimers]);

  const scheduleWarning = useCallback(async () => {
    if (!isAuthenticated) {
      clearTimers();
      setState({
        showWarning: false,
        secondsRemaining: 0,
        timeUntilExpiry: 0,
      });
      return;
    }

    clearTimers();

    const token = await getStoredToken();
    if (!token) {
      return;
    }

    const tokenExpiry = decodeJwtExpiry(token);
    if (!tokenExpiry) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = (tokenExpiry - now) * 1000;

    log.debug("Checking session timeout", {
      now,
      tokenExpiry,
      timeUntilExpiry,
      warningThreshold: SESSION_TIMEOUT_WARNING_MS,
    });

    if (timeUntilExpiry <= 0) {
      setState({
        showWarning: true,
        secondsRemaining: 0,
        timeUntilExpiry: 0,
      });
      return;
    }

    if (timeUntilExpiry <= SESSION_TIMEOUT_WARNING_MS) {
      log.info("Session expiring soon, showing warning", {
        secondsRemaining: Math.floor(timeUntilExpiry / 1000),
      });
      setState({
        showWarning: true,
        secondsRemaining: Math.floor(timeUntilExpiry / 1000),
        timeUntilExpiry,
      });
      startCountdown(timeUntilExpiry);
    } else {
      const warningTime = timeUntilExpiry - SESSION_TIMEOUT_WARNING_MS;
      log.debug("Scheduling warning", { warningTime });

      warningTimerRef.current = setTimeout(() => {
        log.info("Session expiring soon, showing warning");
        setState((prev) => ({
          ...prev,
          showWarning: true,
        }));
        startCountdown(SESSION_TIMEOUT_WARNING_MS);
      }, warningTime);
    }

    lastCheckRef.current = Date.now();
  }, [isAuthenticated, clearTimers, startCountdown]);

  const dismissWarning = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showWarning: false,
    }));
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      log.info("Session expired, logging out");
      await logout();
      dismissWarning();
    } catch (error) {
      log.error("Failed to logout", error);
    }
  }, [logout, dismissWarning]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        scheduleWarning();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [scheduleWarning]);

  useEffect(() => {
    scheduleWarning();
    return clearTimers;
  }, [isAuthenticated, scheduleWarning, clearTimers]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastCheckRef.current >= 60000) {
        scheduleWarning();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [scheduleWarning]);

  return {
    showWarning: state.showWarning,
    secondsRemaining: state.secondsRemaining,
    dismissWarning,
    refreshSession,
  };
}
