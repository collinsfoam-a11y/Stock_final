import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import {
  getOperationalToneColor,
  type OperationalToneToken,
} from "@/theme/operationalSeverity";
import { getDecorativeIconProps } from "@/utils/accessibility";

export type OperationalStatusStripItem = {
  id?: string;
  label: string;
  value?: string | number;
  tone?: OperationalToneToken;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  hidden?: boolean;
};

export interface OperationalStatusStripProps {
  items?: OperationalStatusStripItem[];
  syncState?: string;
  offline?: boolean;
  pendingQueueCount?: number;
  scannerReady?: boolean;
  activeRecounts?: number;
  uploadBacklog?: number;
  deviceConnectivity?: string;
  runtimeHealth?: string;
  compact?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const normalizeRuntimeTone = (runtimeHealth?: string): OperationalToneToken => {
  const value = String(runtimeHealth || "").toLowerCase();
  if (value.includes("critical") || value.includes("error") || value.includes("failed")) {
    return "error";
  }
  if (value.includes("degraded") || value.includes("slow") || value.includes("warning")) {
    return "warning";
  }
  if (value.includes("stable") || value.includes("healthy") || value.includes("ready")) {
    return "success";
  }
  return "info";
};

const createStyles = (tokens: ThemeTokens, compact: boolean) =>
  StyleSheet.create({
    strip: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: colorWithAlpha(tokens.colors.surfaceElevated, tokens.mode === "dark" ? 0.76 : 0.9),
      borderRadius: tokens.radius.md,
      paddingHorizontal: compact ? tokens.spacing.xs : tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    item: {
      minHeight: compact ? 28 : 32,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      paddingHorizontal: compact ? tokens.spacing.xs : tokens.spacing.sm,
      paddingVertical: tokens.spacing.xxs,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xxs,
      maxWidth: "100%",
    },
    label: {
      color: tokens.colors.textMuted,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    value: {
      fontSize: compact ? 11 : 12,
      lineHeight: compact ? 14 : 16,
      fontWeight: "900",
    },
  });

function OperationalStatusStripComponent({
  items,
  syncState,
  offline,
  pendingQueueCount,
  scannerReady,
  activeRecounts,
  uploadBacklog,
  deviceConnectivity,
  runtimeHealth,
  compact = true,
  accessibilityLabel,
  style,
  testID,
}: OperationalStatusStripProps) {
  const tokens = useUiTokens();
  const styles = useMemo(() => createStyles(tokens, compact), [tokens, compact]);
  const decorativeIconProps = getDecorativeIconProps();

  const stripItems = useMemo<OperationalStatusStripItem[]>(() => {
    const derived: (OperationalStatusStripItem | undefined)[] = [
      offline === undefined
        ? undefined
        : {
            id: "connectivity",
            label: "Network",
            value: offline ? "Offline" : "Online",
            tone: offline ? "offline" : "success",
            icon: offline ? "cloud-offline-outline" : "wifi-outline",
          },
      syncState
        ? {
            id: "sync",
            label: "Sync",
            value: syncState,
            tone: offline ? "offline" : "synced",
            icon: "sync-outline",
          }
        : undefined,
      typeof pendingQueueCount === "number"
        ? {
            id: "pending-queue",
            label: "Queue",
            value: pendingQueueCount,
            tone: pendingQueueCount > 0 ? "pending" : "success",
            icon: "layers-outline",
          }
        : undefined,
      scannerReady === undefined
        ? undefined
        : {
            id: "scanner",
            label: "Scanner",
            value: scannerReady ? "Ready" : "Paused",
            tone: scannerReady ? "success" : "warning",
            icon: "scan-outline",
          },
      typeof activeRecounts === "number"
        ? {
            id: "recounts",
            label: "Recounts",
            value: activeRecounts,
            tone: activeRecounts > 0 ? "recount" : "neutral",
            icon: "repeat-outline",
          }
        : undefined,
      typeof uploadBacklog === "number"
        ? {
            id: "uploads",
            label: "Uploads",
            value: uploadBacklog,
            tone: uploadBacklog > 0 ? "pending" : "success",
            icon: "cloud-upload-outline",
          }
        : undefined,
      deviceConnectivity
        ? {
            id: "device",
            label: "Device",
            value: deviceConnectivity,
            tone: "info",
            icon: "hardware-chip-outline",
          }
        : undefined,
      runtimeHealth
        ? {
            id: "runtime",
            label: "Runtime",
            value: runtimeHealth,
            tone: normalizeRuntimeTone(runtimeHealth),
            icon: "speedometer-outline",
          }
        : undefined,
      ...(items || []),
    ];

    return derived.filter((item): item is OperationalStatusStripItem => Boolean(item && !item.hidden));
  }, [
    activeRecounts,
    deviceConnectivity,
    items,
    offline,
    pendingQueueCount,
    runtimeHealth,
    scannerReady,
    syncState,
    uploadBacklog,
  ]);

  if (stripItems.length === 0) return null;

  const label =
    accessibilityLabel ||
    stripItems
      .map((item) => item.accessibilityLabel || `${item.label} ${item.value ?? ""}`.trim())
      .join(". ");

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={label}
      style={[styles.strip, style]}
      testID={testID}
    >
      {stripItems.map((item) => {
        const tone = item.tone || "neutral";
        const toneColor = getOperationalToneColor(tokens, tone);
        return (
          <View
            key={item.id || `${item.label}-${item.value}`}
            style={[
              styles.item,
              {
                borderColor: colorWithAlpha(toneColor, 0.28),
                backgroundColor: colorWithAlpha(toneColor, tokens.mode === "dark" ? 0.12 : 0.06),
              },
            ]}
          >
            {item.icon ? (
              <Ionicons {...decorativeIconProps} name={item.icon} size={12} color={toneColor} />
            ) : null}
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
            {item.value !== undefined ? (
              <Text style={[styles.value, { color: toneColor }]} numberOfLines={1}>
                {item.value}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export const OperationalStatusStrip = memo(OperationalStatusStripComponent);

export default OperationalStatusStrip;
