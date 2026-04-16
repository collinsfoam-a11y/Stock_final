/**
 * Forgot Password Screen
 * Initiates the password reset flow via phone OTP delivery
 */

import React, { useState } from "react";
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

import ModernHeader from "../src/components/ui/ModernHeader";
import ModernCard from "../src/components/ui/ModernCard";
import ModernInput from "../src/components/ui/ModernInput";
import ModernButton from "../src/components/ui/ModernButton";
import apiClient from "../src/services/httpClient";
import { colors, spacing, typography } from "../src/theme/modernDesign";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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

      const response = await apiClient.post(
        "/api/auth/password-reset/request",
        payload,
      );

      if (response.data.success) {
        router.push({
          pathname: "/otp-verification",
          params: { identifier: identifier.trim() },
        });
      } else {
        setError(
          response.data.message ||
            response.data.error?.message ||
            "Failed to send OTP",
        );
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "An error occurred. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style="dark" backgroundColor={colors.gray[50]} />

      <ModernHeader
        title="Reset Password"
        subtitle="Recovery via phone verification"
        showBackButton
        onBackPress={() => router.back()}
      />

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
              <Ionicons
                name="lock-open"
                size={48}
                color={colors.primary[500]}
              />
            </View>

            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your username or registered phone number. We'll send a
              verification code to the phone number associated with your
              account.
            </Text>

            <ModernCard padding={spacing.lg} style={styles.card}>
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
