import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useThemeContextSafe } from "@/context/ThemeContext";
import type { AuthNotificationTone } from "@/utils/authErrorNotifications";

type AuthNoticeCardProps = {
  title: string;
  message: string;
  tone?: AuthNotificationTone;
  actionLabel?: string;
  onActionPress?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ICONS: Record<AuthNotificationTone, keyof typeof Ionicons.glyphMap> = {
  error: "alert-circle",
  warning: "warning",
  info: "information-circle",
  success: "checkmark-circle",
};

export function AuthNoticeCard({
  title,
  message,
  tone = "info",
  actionLabel,
  onActionPress,
  onDismiss,
  style,
  testID,
}: AuthNoticeCardProps) {
  const themeContext = useThemeContextSafe();
  const theme = themeContext?.theme;
  const themeLegacy = themeContext?.themeLegacy;

  const accent = {
    error: theme?.colors.error.main ?? "#ef4444",
    warning: theme?.colors.warning.main ?? "#f59e0b",
    info: theme?.colors.info.main ?? theme?.colors.accent ?? "#3b82f6",
    success: theme?.colors.success.main ?? "#10b981",
  }[tone];

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: accent,
          backgroundColor: `${accent}16`,
          padding: themeLegacy?.spacing.md ?? 16,
          gap: themeLegacy?.spacing.sm ?? 8,
        },
        header: {
          flexDirection: "row",
          alignItems: "flex-start",
        },
        icon: {
          marginRight: themeLegacy?.spacing.sm ?? 8,
          marginTop: 2,
        },
        headerText: {
          flex: 1,
        },
        title: {
          fontSize: themeLegacy?.typography.fontSize.md ?? 16,
          fontWeight: themeLegacy?.typography.fontWeight.semibold ?? "600",
          color: theme?.colors.text.primary ?? "#111827",
          marginBottom: 4,
        },
        message: {
          fontSize: themeLegacy?.typography.fontSize.sm ?? 14,
          lineHeight: 20,
          color: theme?.colors.text.secondary ?? "#475569",
        },
        dismissButton: {
          minWidth: 32,
          minHeight: 32,
          alignItems: "center",
          justifyContent: "center",
          marginLeft: themeLegacy?.spacing.xs ?? 4,
        },
        actionRow: {
          flexDirection: "row",
          justifyContent: "flex-start",
        },
        actionButton: {
          minHeight: 40,
          paddingHorizontal: 14,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${accent}22`,
          borderWidth: 1,
          borderColor: `${accent}66`,
        },
        actionLabel: {
          color: accent,
          fontSize: themeLegacy?.typography.fontSize.sm ?? 14,
          fontWeight: themeLegacy?.typography.fontWeight.semibold ?? "600",
        },
      }),
    [accent, theme, themeLegacy],
  );

  return (
    <View style={[styles.card, style]} testID={testID}>
      <View style={styles.header}>
        <Ionicons
          name={ICONS[tone]}
          size={18}
          color={accent}
          style={styles.icon}
        />
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
        {onDismiss ? (
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.dismissButton}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notice"
          >
            <Ionicons name="close" size={18} color={accent} />
          </TouchableOpacity>
        ) : null}
      </View>

      {actionLabel && onActionPress ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={onActionPress}
            style={styles.actionButton}
            accessibilityRole="button"
          >
            <Text style={styles.actionLabel}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export default AuthNoticeCard;
