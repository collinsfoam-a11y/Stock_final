/**
 * Reset Password Screen - Lavanya eMart
 * Final step: Set new password using the validated reset token
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
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
import { haptics } from "@/services/haptics";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";
import { duration } from "@/theme/staffUiScale";
import {
  spacing as unifiedSpacing,
  textStyles,
  shadows,
} from "@/theme/legacyCompat";

// ---------------------------------------------------------------------------
// Safe Animated View (web-compatible)
// ---------------------------------------------------------------------------

interface SafeAnimatedViewProps {
  children: React.ReactNode;
  style?: any;
  entering?: any;
  delay?: number;
}

const SafeAnimatedView: React.FC<SafeAnimatedViewProps> = ({
  children,
  style,
  entering,
  delay = 0,
}) => {
  if (Platform.OS === "web") {
    return <View style={style}>{children}</View>;
  }
  const animationProps = entering
    ? { entering: entering.delay(delay).duration(duration.slowest).springify() }
    : {};
  return (
    <Animated.View style={style} {...animationProps}>
      {children}
    </Animated.View>
  );
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { reset_token } = useLocalSearchParams<{ reset_token: string }>();
  const clearPendingRedirect = useAuthStore(
    (state) => state.clearPendingRedirect
  );
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void clearPendingRedirect().catch((error) => {
      console.warn("[ResetPassword] Failed to clear pending redirect", error);
    });
  }, [clearPendingRedirect]);

  const handleReset = useCallback(async () => {
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
    haptics.medium();

    try {
      const response = await apiClient.post(
        "/api/auth/password-reset/confirm",
        {
          reset_token,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }
      );

      if (response.data.success) {
        toastService.showSuccess("Password reset. Please sign in again.");
        router.replace("/login");
      } else {
        setError(
          response.data.message ||
            response.data.error?.message ||
            "Failed to reset password"
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Reset failed");
    } finally {
      setIsLoading(false);
    }
  }, [newPassword, confirmPassword, reset_token, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />

      <ModernHeader
        title="Set New Password"
        subtitle="Secure your account"
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
        >
          <View style={styles.contentContainer}>
            <SafeAnimatedView entering={FadeInDown} style={styles.welcomeSection}>
              <View style={styles.iconContainer}>
                <Ionicons
                  name="key"
                  size={48}
                  color={uiTokens.colors.accent}
                />
              </View>

              <Text style={styles.title}>New Password</Text>
              <Text style={styles.subtitle}>
                Create a strong password for your account. It must be at least 8
                characters long.
              </Text>
            </SafeAnimatedView>

            <SafeAnimatedView
              entering={FadeInDown}
              delay={100}
              style={styles.formContainer}
            >
              <ModernCard padding={unifiedSpacing.lg} style={styles.card}>
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
                  disabled={isLoading}
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
                  disabled={isLoading}
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (tokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: unifiedSpacing.lg,
      paddingBottom: unifiedSpacing.xl,
    },
    contentContainer: {
      flex: 1,
      justifyContent: "center",
      maxWidth: 400,
      alignSelf: "center",
      width: "100%",
    },
    welcomeSection: {
      alignItems: "center",
      marginBottom: unifiedSpacing["2xl"],
      paddingTop: unifiedSpacing.xxl,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: radius["3xl"],
      backgroundColor: colorWithAlpha(
        tokens.colors.accent,
        tokens.mode === "dark" ? 0.25 : 0.12
      ),
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginBottom: unifiedSpacing.lg,
      ...shadows.sm,
    },
    title: {
      ...textStyles.h3,
      color: tokens.colors.textPrimary,
      textAlign: "center",
      marginBottom: unifiedSpacing.sm,
    },
    subtitle: {
      ...textStyles.body,
      color: tokens.colors.textSecondary,
      textAlign: "center",
      marginBottom: unifiedSpacing.xl,
      lineHeight: 24,
      paddingHorizontal: unifiedSpacing.md,
    },
    formContainer: {
      marginBottom: unifiedSpacing.xl,
    },
    card: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    button: {
      marginTop: unifiedSpacing.lg,
    },
  });
