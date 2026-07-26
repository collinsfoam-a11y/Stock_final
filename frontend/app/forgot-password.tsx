/**
 * Forgot Password Screen - Lavanya eMart
 * Initiates the password reset flow via phone OTP delivery
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
import { useRouter } from "expo-router";
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
import {
  spacing as unifiedSpacing,
  textStyles,
  shadows,
} from "@/theme/legacyCompat";
import { safeBackNavigation } from "@/utils/navigation";
import { font, gap, radius } from '@/theme/staffUiScale';
import { duration } from "@/theme/staffUiScale";

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

const getPasswordResetRequestError = (err: any): string => {
  const serverMessage =
    err?.response?.data?.message || err?.response?.data?.error?.message;
  if (typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage;
  }

  const message = typeof err?.message === "string" ? err.message.trim() : "";
  if (/network/i.test(message)) {
    return "Could not reach the server. Check the connection, then try again.";
  }
  if (message) {
    return message;
  }

  return "Could not send the verification code. Check the username or phone number, then try again.";
};

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const clearPendingRedirect = useAuthStore(
    (state) => state.clearPendingRedirect
  );
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);

  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void clearPendingRedirect().catch((error) => {
      console.warn("[ForgotPassword] Failed to clear pending redirect", error);
    });
  }, [clearPendingRedirect]);

  const handleBack = useCallback(() => {
    safeBackNavigation(router, { fallbackHref: "/login" });
  }, [router]);

  const handleRequestOtp = useCallback(async () => {
    if (!identifier.trim()) {
      setError("Please enter your username or phone number");
      return;
    }

    setIsLoading(true);
    setError("");
    haptics.medium();

    try {
      const isPhone = /^\+?[0-9]{10,15}$/.test(identifier.trim());
      const payload = isPhone
        ? { phone_number: identifier.trim() }
        : { username: identifier.trim() };

      const response = await apiClient.post(
        "/api/auth/password-reset/request",
        payload
      );

      if (response.data.success) {
        toastService.showSuccess("Verification code sent.");
        router.push({
          pathname: "/otp-verification",
          params: { identifier: identifier.trim() },
        });
      } else {
        setError(
          response.data.message ||
            response.data.error?.message ||
            "Could not send the verification code. Check the username or phone number, then try again."
        );
      }
    } catch (err: any) {
      setError(getPasswordResetRequestError(err));
    } finally {
      setIsLoading(false);
    }
  }, [identifier, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />

      <ModernHeader
        title="Reset Password"
        subtitle="Recovery via phone verification"
        showBackButton
        onBackPress={handleBack}
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
                  name="lock-open"
                  size={48}
                  color={uiTokens.colors.accent}
                />
              </View>

              <Text style={styles.title}>Forgot Password?</Text>
              <Text style={styles.subtitle}>
                Enter your username or registered phone number. We'll send a
                verification code to the phone number associated with your
                account.
              </Text>
            </SafeAnimatedView>

            <SafeAnimatedView
              entering={FadeInDown}
              delay={100}
              style={styles.formContainer}
            >
              <ModernCard padding={unifiedSpacing.lg} style={styles.card}>
                <ModernInput
                  label="Username or Phone"
                  placeholder="e.g. johndoe or +919876543210"
                  value={identifier}
                  onChangeText={(text) => {
                    setIdentifier(text);
                    setError("");
                  }}
                  error={error}
                  icon="person-outline"
                  autoCapitalize="none"
                  disabled={isLoading}
                />

                <ModernButton
                  title={isLoading ? "Sending..." : "Send Verification Code"}
                  onPress={handleRequestOtp}
                  loading={isLoading}
                  disabled={isLoading || !identifier}
                  fullWidth
                  style={styles.button}
                  icon="logo-whatsapp"
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
