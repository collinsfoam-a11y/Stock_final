import React from "react";
import { TouchableOpacity, Text, StyleSheet, Alert, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthStore } from "../store/authStore";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
interface LogoutButtonProps {
  showText?: boolean;
  size?: "small" | "medium" | "large";
  variant?: "icon" | "text" | "both";
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({
  showText = true,
  size = "medium",
  variant = "both",
}) => {
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const { logout, user } = useAuthStore();
  const uiTokens = useUiTokens();

  const handleLogout = () => {
    if (typeof window !== "undefined" && window.confirm) {
      const confirmed = window.confirm(
        `${user?.full_name || "User"}, are you sure you want to logout?`
      );
      if (!confirmed) return;
      setIsLoggingOut(true);
      logout()
        .then(() => undefined)
        .catch((error) => {
          console.error("Logout error:", error);
          Alert.alert("Error", "Failed to logout. Please try again.");
        })
        .finally(() => {
          setIsLoggingOut(false);
        });
      return;
    }

    Alert.alert(
      "Confirm Logout",
      `${user?.full_name || "User"}, are you sure you want to logout?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              setIsLoggingOut(true);
              await logout();
            } catch (error) {
              console.error("Logout error:", error);
              Alert.alert("Error", "Failed to logout. Please try again.");
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const iconSize = size === "small" ? 20 : size === "large" ? 28 : 24;
  const fontSize = size === "small" ? 14 : size === "large" ? 18 : 16;
  const buttonToneStyle = {
    backgroundColor: colorWithAlpha(uiTokens.colors.error, uiTokens.mode === "dark" ? 0.18 : 0.1),
  };
  const buttonBaseStyle = {
    borderRadius: uiTokens.radius.sm,
    minHeight: 44,
    minWidth: 44,
    padding: uiTokens.spacing.md,
  };
  const iconToneStyle = {
    backgroundColor: colorWithAlpha(uiTokens.colors.error, 0.1),
    borderColor: colorWithAlpha(uiTokens.colors.error, 0.3),
  };
  const tapHitSlop = {
    top: uiTokens.spacing.sm,
    right: uiTokens.spacing.sm,
    bottom: uiTokens.spacing.sm,
    left: uiTokens.spacing.sm,
  };

  if (isLoggingOut) {
    return (
      <TouchableOpacity style={styles.button} disabled>
        <ActivityIndicator size="small" color={uiTokens.colors.error} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.button,
        buttonBaseStyle,
        styles[`button${variant}`],
        variant === "icon" && iconToneStyle,
        variant !== "icon" && buttonToneStyle,
      ]}
      onPress={handleLogout}
      activeOpacity={0.7}
      hitSlop={tapHitSlop}
      accessibilityRole="button"
      accessibilityLabel="Log out"
      accessibilityHint="Signs out of the current account"
      accessibilityState={{ disabled: isLoggingOut }}
    >
      {(variant === "icon" || variant === "both") && (
        <Ionicons name="log-out-outline" size={iconSize} color={uiTokens.colors.error} />
      )}
      {(variant === "text" || variant === "both") && showText && (
        <Text style={[styles.buttonText, { color: uiTokens.colors.error, fontSize }]}>Logout</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonicon: {
    borderWidth: 1,
  },
  buttontext: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  buttonboth: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  buttonText: {
    fontWeight: "600",
  },
});
