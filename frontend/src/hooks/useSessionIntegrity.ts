/**
 * Session Integrity Hook - FR-M-34: Session integrity warnings
 * Tracks master data versions and warns if data changed during session
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";

interface ItemVersion {
  item_code: string;
  version: number;
  last_modified: string;
  item_name?: string;
}

interface SessionIntegrityState {
  snapshotTaken: boolean;
  snapshotTime: string | null;
  itemsWithChanges: number;
  warnings: SessionWarning[];
}

interface SessionWarning {
  item_code: string;
  item_name: string;
  field_changed: string;
  old_value: any;
  new_value: any;
  warning_type: "stock_change" | "price_change" | "master_data_change";
}

const DEFAULT_IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes in ms
const sessionSnapshotMemoryStore = new Map<string, string>();

const getSnapshotStorageKey = (sessionId: string | null) =>
  `session_${sessionId ?? "unknown"}_snapshot`;

const setStoredSnapshot = (key: string, value: string) => {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }

  sessionSnapshotMemoryStore.set(key, value);
};

const getStoredSnapshot = (key: string) => {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }

  return sessionSnapshotMemoryStore.get(key) ?? null;
};

const removeStoredSnapshot = (key: string) => {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }

  sessionSnapshotMemoryStore.delete(key);
};

export const useSessionIntegrity = (
  sessionId: string | null,
  initialItemVersions: ItemVersion[] = [],
) => {
  const snapshotStorageKey = getSnapshotStorageKey(sessionId);
  const [integrityState, setIntegrityState] = useState<SessionIntegrityState>({
    snapshotTaken: false,
    snapshotTime: null,
    itemsWithChanges: 0,
    warnings: [],
  });

  // Take snapshot of item versions when session starts
  const takeSnapshot = useCallback(() => {
    const snapshot = initialItemVersions.map((item) => ({
      item_code: item.item_code,
      version: item.version,
      last_modified: item.last_modified,
    }));

    setIntegrityState({
      snapshotTaken: true,
      snapshotTime: new Date().toISOString(),
      itemsWithChanges: 0,
      warnings: [],
    });

    // Persist on web and fall back to in-memory storage on native.
    try {
      setStoredSnapshot(
        snapshotStorageKey,
        JSON.stringify({
          snapshot,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (e) {
      console.warn("Failed to store session snapshot:", e);
    }

    return snapshot;
  }, [initialItemVersions, snapshotStorageKey]);

  // Check for master data changes since snapshot
  const checkIntegrity = useCallback(
    async (currentItemVersions: ItemVersion[]) => {
      if (!integrityState.snapshotTaken) {
        return null;
      }

      try {
        const stored = getStoredSnapshot(snapshotStorageKey);
        if (!stored) return null;

        const { snapshot } = JSON.parse(stored);
        const warnings: SessionWarning[] = [];

        // Compare current versions with snapshot
        for (const current of currentItemVersions) {
          const snapshotItem = snapshot.find(
            (s: ItemVersion) => s.item_code === current.item_code,
          );

          if (snapshotItem && snapshotItem.version !== current.version) {
            warnings.push({
              item_code: current.item_code,
              item_name: current.item_name || current.item_code,
              field_changed: "master_data",
              old_value: snapshotItem.version,
              new_value: current.version,
              warning_type: "master_data_change",
            });
          }
        }

        const hasChanges = warnings.length > 0;

        setIntegrityState((prev) => ({
          ...prev,
          itemsWithChanges: warnings.length,
          warnings: hasChanges ? warnings : prev.warnings,
        }));

        return hasChanges ? warnings : null;
      } catch (e) {
        console.error("Failed to check session integrity:", e);
        return null;
      }
    },
    [integrityState.snapshotTaken, snapshotStorageKey],
  );

  // Get session integrity status for display
  const getIntegrityStatus = useCallback(() => {
    if (!integrityState.snapshotTaken) {
      return {
        status: "not_started",
        message: "No snapshot taken",
        severity: "info",
      };
    }

    if (integrityState.itemsWithChanges === 0) {
      return {
        status: "clean",
        message: "No changes detected",
        severity: "success",
      };
    }

    return {
      status: "warning",
      message: `${integrityState.itemsWithChanges} item(s) changed`,
      severity: "warning",
    };
  }, [integrityState]);

  // Clear snapshot when session ends
  const clearSnapshot = useCallback(() => {
    try {
      removeStoredSnapshot(snapshotStorageKey);
    } catch (e) {
      console.warn("Failed to clear session snapshot:", e);
    }

    setIntegrityState({
      snapshotTaken: false,
      snapshotTime: null,
      itemsWithChanges: 0,
      warnings: [],
    });
  }, [snapshotStorageKey]);

  return {
    integrityState,
    takeSnapshot,
    checkIntegrity,
    getIntegrityStatus,
    clearSnapshot,
  };
};

/**
 * Auto-Pause/Inactivity Hook - FR-M-35: Auto-pause on inactivity
 * Automatically pauses session after N minutes of inactivity
 */
export const useAutoPause = (
  isSessionActive: boolean,
  onPause: () => void,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT,
) => {
  const [isPaused, setIsPaused] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [timeUntilPause, setTimeUntilPause] = useState(idleTimeoutMs);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Track user activity
  const recordActivity = useCallback(() => {
    const now = Date.now();
    setLastActivityTime(now);
    setIsPaused(false);
    setTimeUntilPause(idleTimeoutMs);

    // Resume countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityTime;
      const remaining = Math.max(0, idleTimeoutMs - elapsed);
      setTimeUntilPause(remaining);

      if (remaining <= 0 && isSessionActive && !isPaused) {
        // Auto-pause session
        setIsPaused(true);
        onPause();
      }
    }, 1000);
  }, [idleTimeoutMs, isSessionActive, isPaused, onPause, lastActivityTime]);

  // Start monitoring when session is active
  useEffect(() => {
    if (!isSessionActive) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      return;
    }

    // Start countdown
    recordActivity();

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [isSessionActive, recordActivity]);

  // Manual resume
  const resume = useCallback(() => {
    setIsPaused(false);
    recordActivity();
  }, [recordActivity]);

  // Get formatted time until pause
  const getFormattedTimeUntilPause = useCallback(() => {
    const minutes = Math.floor(timeUntilPause / 60000);
    const seconds = Math.floor((timeUntilPause % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [timeUntilPause]);

  return {
    isPaused,
    lastActivityTime,
    timeUntilPause,
    recordActivity,
    resume,
    getFormattedTimeUntilPause,
  };
};

/**
 * Combined hook for session management
 */
export const useSessionManagement = (
  sessionId: string | null,
  initialItemVersions: ItemVersion[] = [],
  onPause?: () => void,
) => {
  const {
    integrityState,
    takeSnapshot,
    checkIntegrity,
    getIntegrityStatus,
    clearSnapshot,
  } = useSessionIntegrity(sessionId, initialItemVersions);

  const [isSessionActive, setIsSessionActive] = useState(false);

  const autoPause = useAutoPause(isSessionActive, () => {
    setIsSessionActive(false);
    onPause?.();
  });

  const startSession = useCallback(() => {
    setIsSessionActive(true);
    takeSnapshot();
  }, [takeSnapshot]);

  const endSession = useCallback(() => {
    setIsSessionActive(false);
    clearSnapshot();
  }, [clearSnapshot]);

  return {
    isSessionActive,
    integrityStatus: getIntegrityStatus(),
    integrityWarnings: integrityState.warnings,
    autoPause,
    startSession,
    endSession,
    checkIntegrity,
  };
};
