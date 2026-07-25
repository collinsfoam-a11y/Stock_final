/**
 * SyncStatusPill Component
 * Modern, unified status indicator for synchronization state
 */

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { forceSync } from "../../services/syncService";
import {
  refreshSyncStatus,
  subscribeSyncStatus,
  type SyncStatusSnapshot,
} from "../../services/syncStatusPolling";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { colorWithAlpha } from "@/theme/themeTokens";
import { colors as legacyColors } from "@/theme/legacyCompat";
import { radius } from "@/theme/staffUiScale";
export const SyncStatusPill = () => {
  const uiTokens = useUiTokens();
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<SyncStatusSnapshot | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Animation for sync rotation
  const rotation = useSharedValue(0);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((nextStatus) => {
      setStatus(nextStatus);
    });
    void refreshSyncStatus();
    return unsubscribe;
  }, []);

  const handleSync = async () => {
    if (!status?.isOnline || isSyncing) return;

    setIsSyncing(true);
if (!reduceMotion) {
        rotation.value = withRepeat(
          withTiming(360, { duration: 700 }),
          -1
        );
      }

    try {
      await forceSync();
      await refreshSyncStatus();
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setIsSyncing(false);
      rotation.value = 0;
    }
  };

  const animatedIconStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  if (!status) return null;

  // Determine state
  const isOffline = !status.isOnline;
  const hasPending = status.queuedOperations > 0;

  const isDark = uiTokens.mode === "dark";
  const successColor = isDark ? uiTokens.colors.success : legacyColors.success[700];
  const warningColor = isDark ? uiTokens.colors.warning : legacyColors.warning[800];
  const infoColor = isDark ? uiTokens.colors.accent : legacyColors.primary[700];

  let pillColor = successColor;
  let pillBg = isDark ? colorWithAlpha(uiTokens.colors.success, 0.18) : legacyColors.success[50];
  let iconName: keyof typeof Ionicons.glyphMap = "cloud-done";
  let label = "Synced";

  if (isOffline) {
    pillColor = warningColor;
    pillBg = isDark ? colorWithAlpha(uiTokens.colors.warning, 0.18) : legacyColors.warning[50];
    iconName = "cloud-offline";
    label = hasPending ? `Offline (${status.queuedOperations})` : "Offline";
  } else if (isSyncing) {
    pillColor = infoColor;
    pillBg = isDark ? colorWithAlpha(uiTokens.colors.accent, 0.18) : legacyColors.primary[50];
    iconName = "sync";
    label = "Syncing...";
  } else if (hasPending) {
    pillColor = warningColor;
    pillBg = isDark ? colorWithAlpha(uiTokens.colors.warning, 0.18) : legacyColors.warning[50];
    iconName = "cloud-upload";
    label = `${status.queuedOperations} Pending`;
  }

  return (
    <TouchableOpacity
      onPress={handleSync}
      disabled={isOffline || isSyncing || (!hasPending && !isOffline)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}`}
      accessibilityHint={hasPending ? "Attempts to sync pending offline work." : undefined}
      accessibilityState={{
        disabled: isOffline || isSyncing || (!hasPending && !isOffline),
        busy: isSyncing,
      }}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
    >
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor: pillColor }]}>
        <Animated.View style={isSyncing && !reduceMotion ? animatedIconStyle : undefined}>
          <Ionicons name={iconName} size={14} color={pillColor} />
        </Animated.View>
        <Text style={[styles.label, { color: pillColor }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 6,
    minHeight: 44,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
