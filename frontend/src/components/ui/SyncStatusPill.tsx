/**
 * SyncStatusPill Component
 * Modern, unified status indicator for synchronization state
 */

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
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

import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AppTouchable } from "@/components/ui/AppTouchable";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";

export const SyncStatusPill = () => {
  const uiTokens = useUiTokens();
  const styles = makeStyles(uiTokens);
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

    void haptics.light();
    setIsSyncing(true);
    if (!reduceMotion) {
      rotation.value = withRepeat(
        withTiming(360, { duration: uiTokens.motion.slow }),
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
  const successColor = uiTokens.colors.success;
  const warningColor = uiTokens.colors.warning;
  const infoColor = uiTokens.colors.accent;

  let pillColor = successColor;
  let pillBg = isDark ? "rgba(63, 185, 80, 0.18)" : colorWithAlpha(uiTokens.colors.success, 0.1);
  let iconName: keyof typeof Ionicons.glyphMap = "cloud-done";
  let label = "Synced";

  if (isOffline) {
    pillColor = warningColor;
    pillBg = isDark ? "rgba(210, 153, 34, 0.18)" : colorWithAlpha(uiTokens.colors.warning, 0.1);
    iconName = "cloud-offline";
    label = hasPending ? `Offline (${status.queuedOperations})` : "Offline";
  } else if (isSyncing) {
    pillColor = infoColor;
    pillBg = isDark ? "rgba(88, 166, 255, 0.18)" : colorWithAlpha(uiTokens.colors.accent, 0.1);
    iconName = "sync";
    label = "Syncing...";
  } else if (hasPending) {
    pillColor = warningColor;
    pillBg = isDark ? "rgba(210, 153, 34, 0.18)" : colorWithAlpha(uiTokens.colors.warning, 0.1);
    iconName = "cloud-upload";
    label = `${status.queuedOperations} Pending`;
  }

  return (
    <AppTouchable
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
          <Ionicons name={iconName} size={14} color={pillColor} {...getDecorativeIconProps()} />
        </Animated.View>
        <Text style={[styles.label, { color: pillColor }]}>{label}</Text>
      </View>
    </AppTouchable>
  );
};

const makeStyles = (t: ThemeTokens) => StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    borderWidth: 1,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
