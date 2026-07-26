/**
 * OTP Verification Screen - Lavanya eMart
 * Verifies the 6-digit code sent to the user's phone
 */

import React, { useState, useEffect, useCallback } from "react";
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

export default function OtpVerificationScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier: string }>();
  const clearPendingRedirect = useAuthStore(
    (state) => state.clearPendingRedirect
  );
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);

  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(300); // 5 minutes

  const handleBack = useCallback(() => {
    safeBackNavigation(router, { fallbackHref: "/forgot-password" });
  }, [router]);

  useEffect(() => {
    void clearPendingRedirect().catch((error) => {
      console.warn("[OtpVerification] Failed to clear pending redirect", error);
    });
  }, [clearPendingRedirect]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleOtpChange = useCallback(
    (text: string) => {
      const sanitized = text.replace(/\D/g, "").slice(0, 6);
      setOtp(sanitized);
      if (error) setError("");
    },
    [error]
  );

  const handleVerify = useCallback(async () => {
    if (otp.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");
    haptics.medium();

    try {
      const normalizedIdentifier = (identifier || "").trim();
      const isPhone = /^\+?[0-9]{10,15}$/.test(normalizedIdentifier);
      const response = await apiClient.post("/api/auth/password-reset/verify", {
        ...(isPhone
          ? { phone_number: normalizedIdentifier }
          : { username: normalizedIdentifier }),
        otp,
      });

      if (response.data.success) {
        toastService.showSuccess("Code verified.");
        router.push({
          pathname: "/reset-password",
          params: { reset_token: response.data.data.reset_token },
        });
      } else {
        setError(
          response.data.message ||
            response.data.error?.message ||
            "Invalid OTP"
        );
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Verification failed"
      );
    } finally {
      setIsLoading(false);
    }
  }, [otp, identifier, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />

      <ModernHeader
        title="Verify OTP"
        subtitle="Enter the code sent to your phone"
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
                  name="shield-checkmark"
                  size={48}
                  color={uiTokens.colors.accent}
                />
              </View>

              <Text style={styles.title}>Verification Code</Text>
              <Text style={styles.subtitle}>
                Enter the 6-digit code sent to the phone number associated with{" "}
                <Text style={styles.identifierHighlight}>{identifier}</Text>
              </Text>
            </SafeAnimatedView>

            <SafeAnimatedView
              entering={FadeInDown}
              delay={100}
              style={styles.formContainer}
            >
              <ModernCard padding={unifiedSpacing.lg} style={styles.card}>
                <ModernInput
                  label="OTP Code"
                  placeholder="123456"
                  value={otp}
                  onChangeText={handleOtpChange}
                  error={error}
                  keyboardType="numeric"
                  maxLength={6}
                  disabled={isLoading}
                  inputStyle={{
                    letterSpacing: 8,
                    fontSize: 24,
                    textAlign: "center",
                  }}
                />

                <View style={styles.timerContainer}>
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={uiTokens.colors.textSecondary}
                  />
                  <Text style={styles.timerText}>
                    Code expires in {formatTime(timer)}
                  </Text>
                </View>

                <ModernButton
                  title={isLoading ? "Verifying..." : "Verify Code"}
                  onPress={handleVerify}
                  loading={isLoading}
                  disabled={isLoading || otp.length !== 6}
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
    identifierHighlight: {
      color: tokens.colors.textPrimary,
      fontWeight: "700",
    },
    formContainer: {
      marginBottom: unifiedSpacing.xl,
    },
    card: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    timerContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: unifiedSpacing.xs,
      marginTop: unifiedSpacing.sm,
    },
    timerText: {
      ...textStyles.caption,
      color: tokens.colors.textSecondary,
    },
    button: {
      marginTop: unifiedSpacing.lg,
    },
  });

