/**
 * OTP Verification Screen
 * Verifies the 6-digit code sent to the user's phone
 */

import React, { useState, useEffect } from "react";
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

import ModernHeader from "../src/components/ui/ModernHeader";
import ModernCard from "../src/components/ui/ModernCard";
import ModernInput from "../src/components/ui/ModernInput";
import ModernButton from "../src/components/ui/ModernButton";
import apiClient from "../src/services/httpClient";
import { colors, spacing, typography } from "../src/theme/modernDesign";

export default function OtpVerificationScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(300); // 5 minutes

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
        ...(isPhone
          ? { phone_number: normalizedIdentifier }
          : { username: normalizedIdentifier }),
        otp,
      });

      if (response.data.success) {
        // Navigate to Reset Password with token
        router.push({
          pathname: "/reset-password",
          params: { reset_token: response.data.data.reset_token },
        });
      } else {
        setError(
          response.data.message || response.data.error?.message || "Invalid OTP",
        );
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Verification failed",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style="dark" backgroundColor={colors.gray[50]} />

      <ModernHeader
        title="Verify OTP"
        subtitle="Enter the code sent to your phone"
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
                name="shield-checkmark"
                size={48}
                color={colors.primary[500]}
              />
            </View>

            <Text style={styles.title}>Verification Code</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to the phone number associated with{" "}
              <Text style={{ fontWeight: "bold" }}>{identifier}</Text>.
            </Text>

            <ModernCard padding={spacing.lg} style={styles.card}>
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
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={colors.gray[500]}
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
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  timerText: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
  },
});
