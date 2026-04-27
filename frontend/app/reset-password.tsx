/**
 * Reset Password Screen
 * Final step: Set new password using the validated reset token
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import ModernHeader from "../src/components/ui/ModernHeader";
import ModernCard from "../src/components/ui/ModernCard";
import ModernInput from "../src/components/ui/ModernInput";
import ModernButton from "../src/components/ui/ModernButton";
import apiClient from "../src/services/httpClient";
import { useThemeContext } from "../src/context/ThemeContext";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { reset_token } = useLocalSearchParams<{ reset_token: string }>();
  const { theme, themeLegacy, isDark } = useThemeContext();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const styles = React.useMemo(
    () => createStyles(theme, themeLegacy),
    [theme, themeLegacy],
  );

  const handleReset = async () => {
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await apiClient.post(
        "/api/auth/password-reset/confirm",
        {
          reset_token,
          new_password: newPassword,
          confirm_password: confirmPassword,
        },
      );

      if (response.data.success) {
        Alert.alert(
          "Success",
          "Your password has been reset successfully. Please login with your new password.",
          [{ text: "Login", onPress: () => router.replace("/login") }],
        );
      } else {
        setError(
          response.data.message ||
            response.data.error?.message ||
            "Failed to reset password",
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Reset failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={theme.colors.background.default}
      />

      <ModernHeader title="Set New Password" subtitle="Secure your account" />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={FadeInDown.duration(600).springify()}
            style={styles.contentContainer}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="key" size={48} color={theme.colors.primary[500]} />
            </View>

            <Text style={styles.title}>New Password</Text>
            <Text style={styles.subtitle}>
              Create a strong password for your account. It must be at least 8
              characters long.
            </Text>

            <ModernCard padding={themeLegacy.spacing.lg} style={styles.card}>
              <ModernInput
                label="New Password"
                placeholder="Enter new password"
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  setError("");
                }}
                error={error}
                icon="lock-closed-outline"
                secureTextEntry
              />

              <ModernInput
                label="Confirm Password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setError("");
                }}
                icon="lock-closed-outline"
                secureTextEntry
              />

              <ModernButton
                title={isLoading ? "Updating..." : "Reset Password"}
                onPress={handleReset}
                loading={isLoading}
                disabled={isLoading || !newPassword || !confirmPassword}
                fullWidth
                style={styles.button}
              />
            </ModernCard>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (
  theme: ReturnType<typeof useThemeContext>["theme"],
  themeLegacy: ReturnType<typeof useThemeContext>["themeLegacy"],
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background.default,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: themeLegacy.spacing.lg,
      paddingBottom: themeLegacy.spacing.xl,
    },
    contentContainer: {
      flex: 1,
      maxWidth: 400,
      alignSelf: "center",
      width: "100%",
      justifyContent: "center",
      paddingTop: themeLegacy.spacing.xxl,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: themeLegacy.colors.overlayPrimary,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginBottom: themeLegacy.spacing.lg,
    },
    title: {
      fontSize: themeLegacy.typography.fontSize.xxl,
      fontWeight: themeLegacy.typography.fontWeight.bold,
      color: theme.colors.text.primary,
      textAlign: "center",
      marginBottom: themeLegacy.spacing.sm,
    },
    subtitle: {
      fontSize: themeLegacy.typography.fontSize.md,
      color: theme.colors.text.secondary,
      textAlign: "center",
      marginBottom: themeLegacy.spacing.xl,
      lineHeight: 24,
    },
    card: {
      backgroundColor: themeLegacy.colors.surface,
      borderColor: theme.colors.border.light,
    },
    button: {
      marginTop: themeLegacy.spacing.lg,
    },
  });
