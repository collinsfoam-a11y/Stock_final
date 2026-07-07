/**
 * Reset Password Screen
 * Final step: Set new password using the validated reset token
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernCard from "@/components/ui/ModernCard";
import ModernInput from "@/components/ui/ModernInput";
import ModernButton from "@/components/ui/ModernButton";
import apiClient from "@/services/httpClient";
import { toastService } from "@/services/toastService";
import { useAuthStore } from "@/store/authStore";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";

const SafeAnimatedView = ({ children, style, entering, ...props }: any) => {
  if (Platform.OS === "web") {
    return (
      <View style={style} {...props}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={style} entering={entering} {...props}>
      {children}
    </Animated.View>
  );
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { reset_token } = useLocalSearchParams<{ reset_token: string }>();
  const clearPendingRedirect = useAuthStore((state) => state.clearPendingRedirect);
  const uiTokens = useUiTokens();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const styles = useMemo(
    () =>
      StyleSheet.create({
        button: {
          marginTop: uiTokens.spacing.lg,
        },
        card: {
          backgroundColor: uiTokens.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: uiTokens.colors.border,
        },
        container: {
          flex: 1,
          backgroundColor: uiTokens.colors.background,
        },
        contentContainer: {
          flex: 1,
          maxWidth: 400,
          alignSelf: "center",
          width: "100%",
          justifyContent: "center",
          paddingTop: uiTokens.spacing.xxl,
        },
        iconContainer: {
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: colorWithAlpha(
            uiTokens.colors.accent,
            uiTokens.mode === "dark" ? 0.25 : 0.12
          ),
          justifyContent: "center",
          alignItems: "center",
          alignSelf: "center",
          marginBottom: uiTokens.spacing.lg,
        },
        keyboardView: {
          flex: 1,
        },
        scrollContent: {
          flexGrow: 1,
          paddingHorizontal: uiTokens.spacing.lg,
          paddingBottom: uiTokens.spacing.xl,
        },
        subtitle: {
          fontSize: 16,
          color: uiTokens.colors.textSecondary,
          textAlign: "center",
          marginBottom: uiTokens.spacing.xl,
          lineHeight: 24,
        },
        title: {
          fontSize: 28,
          fontWeight: "800",
          color: uiTokens.colors.textPrimary,
          textAlign: "center",
          marginBottom: uiTokens.spacing.sm,
        },
      }),
    [uiTokens]
  );

  useEffect(() => {
    void clearPendingRedirect().catch((error) => {
      console.warn("[ResetPassword] Failed to clear pending redirect", error);
    });
  }, [clearPendingRedirect]);

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
      const response = await apiClient.post("/api/auth/password-reset/confirm", {
        reset_token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      if (response.data.success) {
        toastService.showSuccess("Password reset. Please sign in again.");
        router.replace("/login");
      } else {
        setError(
          response.data.message || response.data.error?.message || "Failed to reset password"
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Reset failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
      edges={["top", "left", "right"]}
    >
      <StatusBar
        style={uiTokens.mode === "dark" ? "light" : "dark"}
        backgroundColor={uiTokens.colors.background}
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
          <SafeAnimatedView
            entering={FadeInDown.duration(600).springify()}
            style={styles.contentContainer}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="key" size={48} color={uiTokens.colors.accent} />
            </View>

            <Text style={[styles.title, { color: uiTokens.colors.textPrimary }]}>New Password</Text>
            <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
              Create a strong password for your account. It must be at least 8 characters long
            </Text>

            <ModernCard padding={uiTokens.spacing.lg} style={styles.card}>
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
          </SafeAnimatedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
