import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { getDecorativeIconProps } from "@/utils/accessibility";
import { colorWithAlpha } from "@/theme/themeTokens";
export type InlineAlertType = "error" | "warning" | "success" | "info";

interface Props {
  type?: InlineAlertType;
  message: string;
  testID?: string;
}

const ICONS: Record<InlineAlertType, keyof typeof Ionicons.glyphMap> = {
  error: "alert-circle",
  warning: "warning",
  success: "checkmark-circle",
  info: "information-circle",
};

export function InlineAlert({ type = "info", message, testID }: Props) {
  const uiTokens = useUiTokens();
  const statusColor = {
    error: uiTokens.colors.error,
    warning: uiTokens.colors.warning,
    success: uiTokens.colors.success,
    info: uiTokens.colors.info,
  }[type];
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderRadius: uiTokens.radius.md,
          paddingVertical: uiTokens.spacing.sm,
          paddingHorizontal: uiTokens.spacing.md,
        },
        icon: {
          marginRight: uiTokens.spacing.sm,
        },
        text: {
          flex: 1,
          fontSize: 14,
          fontWeight: "500",
        },
      }),
    [uiTokens]
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colorWithAlpha(statusColor, uiTokens.mode === "dark" ? 0.18 : 0.1),
          borderColor: statusColor,
        },
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole={type === "error" ? "alert" : "text"}
      accessibilityLabel={`${type} alert: ${message}`}
    >
      <Ionicons
        name={ICONS[type]}
        size={18}
        color={statusColor}
        style={styles.icon}
        {...getDecorativeIconProps()}
      />
      <Text style={[styles.text, { color: uiTokens.colors.textPrimary }]}>{message}</Text>
    </View>
  );
}

export default InlineAlert;
