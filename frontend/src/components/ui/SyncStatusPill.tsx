/**
 * SyncStatusPill Component
 * Modern, unified status indicator for synchronization state
 */

import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getSyncStatus, forceSync } from "../../services/syncService";
import { modernAnimations, modernBorderRadius } from "../../styles/modernDesignSystem";

import { colors } from "@/theme/legacyCompat";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
interface SyncStatus {
  isOnline: boolean;
  queuedOperations: number;
  lastSync: string | null;
  cacheSize: number;
  needsSync: boolean;
}

export const SyncStatusPill = () => {
  const uiTokens = useUiTokens();
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Animation for sync rotation
  const rotation = useSharedValue(0);

  const loadStatus = useCallback(async () => {
    try {
      const s = await getSyncStatus();
      setStatus(s);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleSync = async () => {
    if (!status?.isOnline || isSyncing) return;

    setIsSyncing(true);
    if (!reduceMotion) {
      rotation.value = withRepeat(
        withTiming(360, { duration: modernAnimations.duration.slow }),
        -1
      );
    }

    try {
      await forceSync();
      await loadStatus();
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
  const successColor = isDark ? uiTokens.colors.success : colors.success[700];
  const warningColor = isDark ? uiTokens.colors.warning : colors.warning[800];
  const infoColor = isDark ? uiTokens.colors.accent : colors.primary[700];

  let pillColor = successColor;
  let pillBg = isDark ? "rgba(63, 185, 80, 0.18)" : colors.success[50];
  let iconName: keyof typeof Ionicons.glyphMap = "cloud-done";
  let label = "Synced";

  if (isOffline) {
    pillColor = warningColor;
    pillBg = isDark ? "rgba(210, 153, 34, 0.18)" : colors.warning[50];
    iconName = "cloud-offline";
    label = hasPending ? `Offline (${status.queuedOperations})` : "Offline";
  } else if (isSyncing) {
    pillColor = infoColor;
    pillBg = isDark ? "rgba(88, 166, 255, 0.18)" : colors.primary[50];
    iconName = "sync";
    label = "Syncing...";
  } else if (hasPending) {
    pillColor = warningColor;
    pillBg = isDark ? "rgba(210, 153, 34, 0.18)" : colors.warning[50];
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
    borderRadius: modernBorderRadius.full,
    borderWidth: 1,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
