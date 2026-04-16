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
import { colors, spacing, typography } from "../src/theme/modernDesign";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { reset_token } = useLocalSearchParams<{ reset_token: string }>();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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
      <StatusBar style="dark" backgroundColor={colors.gray[50]} />

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
              <Ionicons name="key" size={48} color={colors.primary[500]} />
            </View>

            <Text style={styles.title}>New Password</Text>
            <Text style={styles.subtitle}>
              Create a strong password for your account. It must be at least 8
              characters long.
            </Text>

            <ModernCard padding={spacing.lg} style={styles.card}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  contentContainer: {
    flex: 1,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
    justifyContent: "center",
    paddingTop: spacing["2xl"],
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary[50],
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    color: colors.gray[600],
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.white,
  },
  button: {
    marginTop: spacing.lg,
  },
});
