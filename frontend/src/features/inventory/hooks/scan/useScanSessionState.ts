import { useState, useCallback, useEffect } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

import { useSafeAsync } from "../../../../hooks/useSafeAsync";
import { usePerformanceMonitor } from "../../../../hooks/usePerformanceMonitor";
import { useWebSocket } from "../../../../hooks/useWebSocket";
import { getSessionStats, SessionStatsResponse } from "../../../../services/api/api";
import { localDb } from "../../../../db/localDb";
import { useAuthStore } from "../../../../store/authStore";

interface UseScanSessionStateProps {
  sessionId: string | undefined;
  offlineMode: boolean;
  isScreenFocused: boolean;
  setIsScanning: (val: boolean) => void;
  isFinishing: boolean;
}

export function useScanSessionState({
  sessionId,
  offlineMode,
  isScreenFocused,
  setIsScanning,
  isFinishing,
}: UseScanSessionStateProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { safeSetState, safeAsync } = useSafeAsync();

  const [sessionStats, setSessionStats] = useState<SessionStatsResponse>({
    id: String(sessionId ?? ""),
    scannedItems: 0,
    verifiedItems: 0,
    pendingItems: 0,
    totalItems: 0,
  });

  const { metrics: performanceMetrics, startMonitoring, stopMonitoring, performanceWarning } =
    usePerformanceMonitor({
      sampleInterval: 2000,
      performanceThreshold: 25,
    });

  const { lastMessage } = useWebSocket(sessionId ? String(sessionId) : undefined, isScreenFocused);

  const loadSessionStats = useCallback(async () => {
    if (!sessionId || !isAuthenticated) return;
    try {
      const stats = offlineMode
        ? await safeAsync(() => localDb.getSessionStats(sessionId))
        : await safeAsync(() => getSessionStats(sessionId));
      if (stats) {
        safeSetState(setSessionStats, {
          id: String(sessionId),
          ...stats,
        });
      }
    } catch (error) {
      console.error("Failed to load stats", error);
    }
  }, [isAuthenticated, offlineMode, safeAsync, safeSetState, sessionId]);

  // Handle WebSocket Messages
  useEffect(() => {
    if (lastMessage?.type === "session_update") {
      const status = String(lastMessage.payload?.status || "").toUpperCase();
      const reason = lastMessage.payload?.reason;

      if (status === "PAUSED") {
        setIsScanning(false);
        Alert.alert("Session Paused", reason || "A supervisor has paused this session.", [
          { text: "OK" },
        ]);
      } else if (["REVIEW", "RECONCILE", "FINALIZED", "CLOSED"].includes(status) && !isFinishing) {
        const message =
          status === "FINALIZED"
            ? reason || "This session has been finalized."
            : reason || "This session has been submitted for supervisor review.";
        Alert.alert(status === "FINALIZED" ? "Session Finalized" : "Session Submitted", message, [
          {
            text: "OK",
            onPress: () => router.replace("/staff/home"),
          },
        ]);
      }

      // Refresh stats on any update
      loadSessionStats();
    }
  }, [isFinishing, lastMessage, loadSessionStats, router, setIsScanning]);

  // Start performance monitoring
  useEffect(() => {
    startMonitoring();
    return () => stopMonitoring();
  }, [startMonitoring, stopMonitoring]);

  return {
    sessionStats,
    loadSessionStats,
    performanceMetrics,
    performanceWarning,
  };
}
