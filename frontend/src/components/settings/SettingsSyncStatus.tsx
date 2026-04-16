import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "../../hooks/useTheme";
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
});

export default SettingsSyncStatus;
