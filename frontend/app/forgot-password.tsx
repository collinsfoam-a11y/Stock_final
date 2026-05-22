/**
 * Forgot Password Screen
 * Initiates the password reset flow via phone OTP delivery
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
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

const getPasswordResetRequestError = (err: any): string => {
  const serverMessage = err?.response?.data?.message || err?.response?.data?.error?.message;
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
  const clearPendingRedirect = useAuthStore((state) => state.clearPendingRedirect);
  const uiTokens = useUiTokens();
  const prefersReducedMotion = useReducedMotion();
  const [identifier, setIdentifier] = useState("");
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
      console.warn("[ForgotPassword] Failed to clear pending redirect", error);
    });
  }, [clearPendingRedirect]);

  const handleBack = () => {
    safeBackNavigation(router, { fallbackHref: "/login" });
  };

  const handleRequestOtp = async () => {
    if (!identifier.trim()) {
      setError("Please enter your username or phone number");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Determine if input is phone or username
      const isPhone = /^\+?[0-9]{10,15}$/.test(identifier.trim());
      const payload = isPhone
        ? { phone_number: identifier.trim() }
        : { username: identifier.trim() };

      const response = await apiClient.post("/api/auth/password-reset/request", payload);

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
        title="Reset Password"
        subtitle="Recovery via phone verification"
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
              <Ionicons name="lock-open" size={48} color={uiTokens.colors.accent} />
            </View>

            <Text style={[styles.title, { color: uiTokens.colors.textPrimary }]}>
              Forgot Password?
            </Text>
            <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
              Enter your username or registered phone number. We&apos;ll send a verification code to the
              phone number associated with your account
            </Text>

            <ModernCard padding={uiTokens.spacing.lg} style={styles.card}>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
