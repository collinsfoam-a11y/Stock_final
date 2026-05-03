import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "../../hooks/useTheme";
import { getSyncStatus } from "../../services/syncService";
import { useSettingsStore } from "../../store/settingsStore";

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "Not synced yet";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Saved recently";
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 10) return "Saved just now";
  if (diffSeconds < 60) return `Saved ${diffSeconds}s ago`;

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `Saved ${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Saved ${diffHours}h ago`;

  return `Saved ${Math.round(diffHours / 24)}d ago`;
}

export function SettingsSyncStatus() {
  const { colors, typography, borderRadius } = useTheme();
  const isSyncing = useSettingsStore((state) => state.isSyncing);
  const hasPendingSync = useSettingsStore((state) => state.hasPendingSync);
  const lastSyncError = useSettingsStore((state) => state.lastSyncError);
  const lastSyncedAt = useSettingsStore((state) => state.lastSyncedAt);
  const [debugStatus, setDebugStatus] = React.useState<{
    connectivityState: string;
    queueLength: number;
    lastReplayStatus: string;
    replaySuccessRate: number;
    offlineUsagePercent: number;
  } | null>(null);

  React.useEffect(() => {
    if (!__DEV__) {
      return;
    }

    let active = true;
    const refresh = async () => {
      try {
        const syncStatus = await getSyncStatus();
        const replayRun = syncStatus.lastReplayRun;
        const replayAudit = syncStatus.lastReplayAudit;
        const lastReplayStatus = replayRun
          ? replayRun.failed > 0
            ? `FAILED (${replayRun.failed}/${replayRun.total})`
            : replayRun.total > 0
              ? `SUCCESS (${replayRun.success}/${replayRun.total})`
              : "IDLE"
          : replayAudit
            ? replayAudit.success
              ? "SUCCESS"
              : "FAILED"
            : "IDLE";

        if (active) {
          setDebugStatus({
            connectivityState: syncStatus.connectivityState || "UNKNOWN",
            queueLength: syncStatus.queuedOperations || 0,
            lastReplayStatus,
            replaySuccessRate: Number(syncStatus.replaySuccessRate || 0),
            offlineUsagePercent: Number(syncStatus.offlineUsagePercent || 0),
          });
        }
      } catch {
        if (active) {
          setDebugStatus(null);
        }
      }
    };

    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const state = lastSyncError
    ? {
        icon: "warning-outline" as const,
        label: "Sync issue",
        detail: "Changes are stored locally and will retry.",
        color: colors.warning,
        background: `${colors.warning}18`,
        border: `${colors.warning}30`,
      }
    : isSyncing || hasPendingSync
      ? {
          icon: "cloud-upload-outline" as const,
          label: "Saving settings",
          detail: "Syncing your changes to your account.",
          color: colors.accent || colors.primary,
          background: `${colors.accent || colors.primary}18`,
          border: `${colors.accent || colors.primary}30`,
        }
      : {
          icon: "checkmark-circle-outline" as const,
          label: "Settings saved",
          detail: formatRelativeTime(lastSyncedAt),
          color: colors.success,
          background: `${colors.success}18`,
          border: `${colors.success}30`,
        };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: state.background,
          borderColor: state.border,
          borderRadius: borderRadius.md,
        },
      ]}
    >
      <Ionicons name={state.icon} size={18} color={state.color} />
      <View style={styles.copy}>
        <Text
          style={[
            styles.label,
            {
              color: colors.text,
              fontSize: typography.fontSize.sm,
            },
          ]}
        >
          {state.label}
        </Text>
        <Text
          style={[
            styles.detail,
            {
              color: colors.textSecondary,
              fontSize: typography.fontSize.xs,
            },
          ]}
        >
          {state.detail}
        </Text>
        {__DEV__ && debugStatus ? (
          <View
            style={[
              styles.debugPanel,
              {
                borderColor: `${colors.textSecondary}33`,
                backgroundColor: `${colors.background}cc`,
              },
            ]}
          >
            <Text
              style={[
                styles.debugText,
                {
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.xs,
                },
              ]}
            >
              Connectivity: {debugStatus.connectivityState}
            </Text>
            <Text
              style={[
                styles.debugText,
                {
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.xs,
                },
              ]}
            >
              Queue: {debugStatus.queueLength}
            </Text>
            <Text
              style={[
                styles.debugText,
                {
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.xs,
                },
              ]}
            >
              Last Replay: {debugStatus.lastReplayStatus}
            </Text>
            <Text
              style={[
                styles.debugText,
                {
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.xs,
                },
              ]}
            >
              Replay Success: {debugStatus.replaySuccessRate.toFixed(1)}%
            </Text>
            <Text
              style={[
                styles.debugText,
                {
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.xs,
                },
              ]}
            >
              Offline Usage: {debugStatus.offlineUsagePercent.toFixed(1)}%
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontWeight: "600",
  },
  detail: {
    lineHeight: 16,
  },
  debugPanel: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  debugText: {
    fontWeight: "500",
  },
});

export default SettingsSyncStatus;
