/**
 * OTP Verification Screen
 * Verifies the 6-digit code sent to the user's phone
 */

import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
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
import { toastService } from "../src/services/toastService";
import { useAuthStore } from "../src/store/authStore";
import { useUiTokens } from "../src/hooks/useUiTokens";
import { useReducedMotion } from "../src/hooks/useReducedMotion";
import { colorWithAlpha } from "../src/theme/themeTokens";
import { safeBackNavigation } from "@/utils/navigation";
import { operationalMotion } from "@/utils/motion";

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

export default function OtpVerificationScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier: string }>();
  const clearPendingRedirect = useAuthStore((state) => state.clearPendingRedirect);
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();

  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(300); // 5 minutes
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
          borderRadius: uiTokens.radius.full,
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
        timerContainer: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: uiTokens.spacing.xs,
          marginTop: uiTokens.spacing.sm,
        },
        timerText: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
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

  const handleBack = () => {
    safeBackNavigation(router, { fallbackHref: "/forgot-password" });
  };

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

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const normalizedIdentifier = (identifier || "").trim();
      const isPhone = /^\+?[0-9]{10,15}$/.test(normalizedIdentifier);
      const response = await apiClient.post("/api/auth/password-reset/verify", {
        ...(isPhone ? { phone_number: normalizedIdentifier } : { username: normalizedIdentifier }),
        otp,
      });

      if (response.data.success) {
        toastService.showSuccess("Code verified.");
        // Navigate to Reset Password with token
        router.push({
          pathname: "/reset-password",
          params: { reset_token: response.data.data.reset_token },
        });
      } else {
        setError(response.data.message || response.data.error?.message || "Invalid OTP");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Verification failed");
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

      <ModernHeader
        title="Verify OTP"
        subtitle="Enter the code sent to your phone"
        showBackButton
        onBackPress={handleBack}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <SafeAnimatedView
            entering={
              prefersReducedMotion
                ? undefined
                : FadeInDown.duration(operationalMotion.slow).springify()
            }
            style={styles.contentContainer}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark" size={48} color={uiTokens.colors.accent} />
            </View>

            <Text style={[styles.title, { color: uiTokens.colors.textPrimary }]}>
              Verification Code
            </Text>
            <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
              Enter the 6-digit code sent to the phone number associated with{" "}
              <Text style={{ color: uiTokens.colors.textPrimary, fontWeight: "700" }}>
                {identifier}
              </Text>
            </Text>

            <ModernCard padding={uiTokens.spacing.lg} style={styles.card}>
              <ModernInput
                label="OTP Code"
                placeholder="123456"
                value={otp}
                onChangeText={(text) => {
                  // Only allow numbers
                  if (/^\d*$/.test(text)) {
                    setOtp(text);
                    setError("");
                  }
                }}
                error={error}
                keyboardType="numeric"
                maxLength={6}
                inputStyle={{
                  letterSpacing: 8,
                  fontSize: 24,
                  textAlign: "center",
                }}
              />

              <View style={styles.timerContainer}>
                <Ionicons name="time-outline" size={16} color={uiTokens.colors.textSecondary} />
                <Text style={[styles.timerText, { color: uiTokens.colors.textSecondary }]}>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
