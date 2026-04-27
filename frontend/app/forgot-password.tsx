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
import { useThemeContext } from "../src/context/ThemeContext";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { theme, themeLegacy, isDark } = useThemeContext();
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const styles = React.useMemo(
    () => createStyles(theme, themeLegacy),
    [theme, themeLegacy],
  );

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
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={theme.colors.background.default}
      />

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
                color={theme.colors.primary[500]}
              />
            </View>

            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your username or registered phone number. We'll send a
              verification code to the phone number associated with your
              account.
            </Text>

            <ModernCard padding={themeLegacy.spacing.lg} style={styles.card}>
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
