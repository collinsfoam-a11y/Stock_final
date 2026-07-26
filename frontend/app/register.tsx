/**
 * Register Screen - Lavanya eMart
 * Create a new staff account
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuthStore } from "@/store/authStore";
import { registerUser } from "@/services/api/api";
import { createLogger } from "@/services/logging";
import { toastService } from "@/services/toastService";
import ModernButton from "@/components/ui/ModernButton";
import ModernCard from "@/components/ui/ModernCard";
import ModernHeader from "@/components/ui/ModernHeader";
import ModernInput from "@/components/ui/ModernInput";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getRouteForRole, type UserRole } from "@/utils/roleNavigation";
import { safeBackNavigation } from "@/utils/navigation";
import { getFlag } from "@/constants/flags";
import { haptics } from "@/services/haptics";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";
import { duration } from "@/theme/staffUiScale";
import {
  spacing as unifiedSpacing,
  textStyles,
  shadows,
} from "@/theme/legacyCompat";

type RegisterFormData = {
  username: string;
  password: string;
  confirmPassword: string;
  full_name: string;
  employee_id: string;
  phone: string;
};

const log = createLogger("register");

const initialFormData: RegisterFormData = {
  username: "",
  password: "",
  confirmPassword: "",
  full_name: "",
  employee_id: "",
  phone: "",
};

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

export default function Register() {
  const [formData, setFormData] = useState<RegisterFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterFormData, string>>>({});
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const establishSession = useAuthStore((state) => state.establishSession);
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const publicRegistrationEnabled = getFlag("enablePublicRegistration");

  const updateField = useCallback((field: keyof RegisterFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleBackToLogin = useCallback(() => {
    safeBackNavigation(router, { fallbackHref: "/login" });
  }, [router]);

  const validateForm = () => {
    const nextErrors: Partial<Record<keyof RegisterFormData, string>> = {};

    if (!formData.username.trim()) {
      nextErrors.username = "Username is required";
    }
    if (!formData.full_name.trim()) {
      nextErrors.full_name = "Full name is required";
    }
    if (formData.password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters";
    }
    if (formData.password !== formData.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      toastService.showError("Please fix the highlighted fields.");
      return;
    }

    try {
      setLoading(true);
      haptics.medium();
      
      const response = await registerUser({
        username: formData.username.trim(),
        password: formData.password,
        full_name: formData.full_name.trim(),
        employee_id: formData.employee_id.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      });

      if (!response.user || !response.access_token) {
        throw new Error("Registration succeeded but did not return a valid session.");
      }

      await establishSession({
        ...response,
        user: {
          ...response.user,
          role: response.user.role as UserRole,
        },
      });

      toastService.showSuccess("Account created.");
      const targetRoute = getRouteForRole(response.user.role as UserRole);
      router.replace(targetRoute as any);
    } catch (error: any) {
      let errorMessage = "Unable to register. Please try again.";

      if (error.response?.data) {
        const errorData = error.response.data;
        if (typeof errorData === "object" && errorData.message) {
          errorMessage = errorData.message;
        } else if (typeof errorData === "object" && errorData.detail) {
          if (typeof errorData.detail === "object" && errorData.detail.message) {
            errorMessage = errorData.detail.message;
          } else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          }
        } else if (typeof errorData === "string") {
          errorMessage = errorData;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (errorMessage.includes("already exists") || errorMessage.includes("Username")) {
        errorMessage = "Username already exists. Please choose a different username.";
        setErrors((prev) => ({ ...prev, username: errorMessage }));
      } else if (errorMessage.includes("timeout") || errorMessage.includes("ECONNABORTED")) {
        errorMessage = "Connection timeout. Please check your connection and try again.";
      } else if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("Cannot connect")) {
        errorMessage = "Cannot connect to server. Please check if the backend server is running.";
      }

      toastService.showError(errorMessage);
      log.warn("Registration failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  if (!publicRegistrationEnabled) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
        <ModernHeader
          title="Account Setup"
          subtitle="Administrator approval required"
          showBackButton
          onBackPress={handleBackToLogin}
        />

        <View style={styles.contentContainer}>
          <SafeAnimatedView entering={FadeInDown} style={styles.welcomeSection}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="lock-closed"
                size={48}
                color={uiTokens.colors.accent}
              />
            </View>

            <Text style={styles.title}>Registration is restricted</Text>
            <Text style={styles.subtitle}>
              New users must be created by an administrator before they can sign in.
            </Text>
          </SafeAnimatedView>

          <SafeAnimatedView entering={FadeInDown} delay={100} style={styles.formContainer}>
            <ModernCard padding={unifiedSpacing.lg} style={styles.card}>
              <ModernButton
                title="Return to Sign In"
                onPress={handleBackToLogin}
                fullWidth
                icon="log-in-outline"
              />
            </ModernCard>
          </SafeAnimatedView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
      
      <ModernHeader
        title="Create Account"
        subtitle="Staff profile setup"
        showBackButton
        onBackPress={handleBackToLogin}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="none"
        >
          <View style={styles.contentContainer}>
            <SafeAnimatedView entering={FadeInDown} style={styles.welcomeSection}>
              <View style={styles.iconContainer}>
                <Ionicons
                  name="person-add"
                  size={48}
                  color={uiTokens.colors.accent}
                />
              </View>

              <Text style={styles.title}>Account Details</Text>
              <Text style={styles.subtitle}>
                Ask an administrator if registration is restricted for your store.
              </Text>
            </SafeAnimatedView>

            <SafeAnimatedView
              entering={FadeInDown}
              delay={100}
              style={styles.formContainer}
            >
              <ModernCard padding={unifiedSpacing.lg} style={styles.card}>
                <ModernInput
                  label="Username"
                  required
                  placeholder="Enter username"
                  value={formData.username}
                  onChangeText={(text) => updateField("username", text)}
                  error={errors.username}
                  icon="person-outline"
                  autoCapitalize="none"
                />

                <ModernInput
                  label="Full Name"
                  required
                  placeholder="e.g. Jane Doe"
                  value={formData.full_name}
                  onChangeText={(text) => updateField("full_name", text)}
                  error={errors.full_name}
                  icon="text-outline"
                  autoCapitalize="words"
                />

                <ModernInput
                  label="Employee ID"
                  placeholder="Optional ID"
                  value={formData.employee_id}
                  onChangeText={(text) => updateField("employee_id", text)}
                  icon="id-card-outline"
                />

                <ModernInput
                  label="Phone Number"
                  placeholder="Optional phone number"
                  value={formData.phone}
                  onChangeText={(text) => updateField("phone", text)}
                  icon="call-outline"
                  keyboardType="phone-pad"
                />

                <ModernInput
                  label="Password"
                  required
                  placeholder="Minimum 6 characters"
                  value={formData.password}
                  onChangeText={(text) => updateField("password", text)}
                  error={errors.password}
                  icon="lock-closed-outline"
                  secureTextEntry
                />

                <ModernInput
                  label="Confirm Password"
                  required
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChangeText={(text) => updateField("confirmPassword", text)}
                  error={errors.confirmPassword}
                  icon="lock-closed-outline"
                  secureTextEntry
                />

                <ModernButton
                  title={loading ? "Creating Account..." : "Create Account"}
                  onPress={handleRegister}
                  loading={loading}
                  disabled={loading}
                  fullWidth
                  icon="person-add"
                  style={styles.registerButton}
                />

                <View style={styles.loginLink}>
                  <Text style={styles.loginLinkText}>
                    Already have an account?
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="link"
                    accessibilityLabel="Sign in"
                    onPress={handleBackToLogin}
                  >
                    <Text style={styles.loginLinkButton}>
                      Sign in
                    </Text>
                  </TouchableOpacity>
                </View>
              </ModernCard>
            </SafeAnimatedView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    registerButton: {
      marginTop: unifiedSpacing.lg,
    },
    loginLink: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: unifiedSpacing.xs,
      marginTop: unifiedSpacing.xl,
      flexWrap: "wrap",
    },
    loginLinkText: {
      ...textStyles.body,
      color: tokens.colors.textSecondary,
    },
    loginLinkButton: {
      ...textStyles.body,
      color: tokens.colors.accent,
      fontWeight: "700",
    },
  });
