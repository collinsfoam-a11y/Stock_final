import React, { useMemo } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, radius, gap } from "@/theme/staffUiScale";

export type UserEssentials = {
  id?: string;
  username: string;
  full_name?: string | null;
  role: "staff" | "supervisor" | "admin";
  is_active?: boolean;
  employee_id?: string | null;
};

export type UserEssentialsCardProps = {
  user: UserEssentials;
  showStatus?: boolean;
  showRole?: boolean;
  size?: "sm" | "md" | "lg";
  style?: ViewStyle;
  testID?: string;
};

const getInitials = (user: UserEssentials): string => {
  const name = user.full_name || user.username;
  const parts = name.split(" ").filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "U";
  if (parts.length === 1) {
    const word = parts[0]!;
    const first = word.charAt(0).toUpperCase();
    return word.length <= 3 ? word.toUpperCase() : first;
  }
  return parts.map((w) => w.charAt(0).toUpperCase()).join("");
};

const getRoleColor = (role: string, uiTokens: ThemeTokens) => {
  switch (role) {
    case "admin":
      return uiTokens.colors.error;
    case "supervisor":
      return uiTokens.colors.warning;
    default:
      return uiTokens.colors.accent;
  }
};

export function UserEssentialsCard({
  user,
  showStatus = true,
  showRole = true,
  size = "md",
  style,
  testID,
}: UserEssentialsCardProps) {
  const uiTokens = useUiTokens();
  const roleColor = getRoleColor(user.role, uiTokens);
  const isActive = user.is_active !== false;
  const styles = useMemo(() => createStyles(uiTokens, size), [uiTokens, size]);

  return (
    <View
      style={[styles.card, style]}
      testID={testID || `user-essentials-${user.username}`}
      accessibilityLabel={`User ${user.full_name || user.username}, role ${user.role}${showStatus ? `, ${isActive ? "active" : "inactive"}` : ""}`}
    >
      <View style={styles.avatar}>
        {getInitials(user).length > 0 ? (
          <Text
            style={[styles.avatarText, { color: roleColor }]}
            accessibilityLabel={`Avatar for ${user.full_name || user.username}`}
          >
            {getInitials(user)}
          </Text>
        ) : (
          <Ionicons
            name="person"
            size={size === "lg" ? 28 : size === "sm" ? 16 : 20}
            color={roleColor}
          />
        )}
      </View>
      <View style={styles.info}>
        <Text
          style={[styles.name, size === "lg" && { fontSize: font.size.xl }]}
          numberOfLines={1}
          accessibilityLabel={user.full_name || user.username}
        >
          {user.full_name || user.username}
        </Text>
        {user.username !== user.full_name && user.full_name ? (
          <Text style={styles.username} numberOfLines={1}>
            @{user.username}
          </Text>
        ) : null}
        {user.employee_id ? (
          <Text style={styles.username} numberOfLines={1}>
            ID: {user.employee_id}
          </Text>
        ) : null}
        {showRole && (
          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor: colorWithAlpha(roleColor, 0.1),
                borderColor: colorWithAlpha(roleColor, 0.25),
              },
            ]}
          >
            <Text
              style={[styles.roleBadgeText, { color: roleColor }]}
              accessibilityLabel={`Role: ${user.role}`}
            >
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </Text>
          </View>
        )}
      </View>
      {showStatus && (
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isActive ? uiTokens.colors.success : uiTokens.colors.textMuted },
          ]}
          accessibilityLabel={isActive ? "Active" : "Inactive"}
        />
      )}
    </View>
  );
}

const createStyles = (uiTokens: ThemeTokens, size: "sm" | "md" | "lg") =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: gap.sm,
    },
    avatar: {
      width: size === "lg" ? 56 : size === "sm" ? 32 : 44,
      height: size === "lg" ? 56 : size === "sm" ? 32 : 44,
      borderRadius: radius.full,
      backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.12),
      justifyContent: "center",
      alignItems: "center",
    },
    avatarText: {
      fontSize: size === "lg" ? font.size.display : size === "sm" ? font.size.base : font.size.md,
      fontWeight: font.weight.extrabold,
      letterSpacing: font.tracking.tight,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: size === "lg" ? font.size.md : size === "sm" ? font.size.base : font.size.lg,
      fontWeight: font.weight.semibold,
      color: uiTokens.colors.textPrimary,
    },
    username: {
      fontSize: font.size.caption,
      color: uiTokens.colors.textSecondary,
      marginTop: gap.xs,
    },
    roleBadge: {
      paddingHorizontal: gap.sm,
      paddingVertical: gap.xs,
      borderRadius: radius.sm,
      borderWidth: 1,
      alignSelf: "flex-start",
      marginTop: gap.xs,
    },
    roleBadgeText: {
      fontSize: font.size.label,
      fontWeight: font.weight.bold,
      textTransform: "uppercase",
      letterSpacing: font.tracking.wide,
    },
    statusDot: {
      width: size === "lg" ? 12 : size === "sm" ? 8 : 10,
      height: size === "lg" ? 12 : size === "sm" ? 8 : 10,
      borderRadius: radius.full,
      marginLeft: gap.sm,
    },
  });
