import React from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/store/authStore";
import { registerUser } from "@/services/api/api";
import { createLogger } from "@/services/logging";
import { toastService } from "@/services/toastService";
import { ModernButton } from "@/components/ui/ModernButton";
import { ModernCard } from "@/components/ui/ModernCard";
import { ModernHeader } from "@/components/ui/ModernHeader";
import { ModernInput } from "@/components/ui/ModernInput";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getRouteForRole, type UserRole } from "@/utils/roleNavigation";
import { safeBackNavigation } from "@/utils/navigation";
import { getFlag } from "@/constants/flags";

import { AppTouchable } from "@/components/ui/AppTouchable";

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

export default function Register() {
  const [formData, setFormData] = React.useState<RegisterFormData>(initialFormData);
  const [errors, setErrors] = React.useState<Partial<Record<keyof RegisterFormData, string>>>({});
  const [loading, setLoading] = React.useState(false);

  const router = useRouter();
  const establishSession = useAuthStore((state) => state.establishSession);
  const uiTokens = useUiTokens();
  const publicRegistrationEnabled = getFlag("enablePublicRegistration");

  const updateField = React.useCallback((field: keyof RegisterFormData, value: string) => {
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

  const handleBackToLogin = () => {
    safeBackNavigation(router, { fallbackHref: "/login" });
  };

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
      <SafeAreaView
        style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
        edges={["top", "left", "right"]}
      >
        <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
        <ModernHeader
          title="Account Setup"
          subtitle="Administrator approval required"
          showBackButton
          onBackPress={handleBackToLogin}
        />

        <View style={styles.restrictedContent}>
          <ModernCard
            padding={uiTokens.spacing.lg}
            style={[styles.formCard, { backgroundColor: uiTokens.colors.surfaceElevated }]}
          >
            <Text style={[styles.title, { color: uiTokens.colors.textPrimary }]}>
              Registration is restricted
            </Text>
            <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
              New users must be created by an administrator before they can sign in.
            </Text>
            <ModernButton
              title="Sign In"
              onPress={handleBackToLogin}
              fullWidth
              icon="log-in-outline"
            />
          </ModernCard>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
      edges={["top", "left", "right"]}
    >
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
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ModernCard
            padding={uiTokens.spacing.lg}
            style={[styles.formCard, { backgroundColor: uiTokens.colors.surfaceElevated }]}
          >
            <Text style={[styles.title, { color: uiTokens.colors.textPrimary }]}>
              Account Details
            </Text>
            <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>
              Ask an administrator if registration is restricted for your store.
            </Text>

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
              placeholder="Enter your full name"
              value={formData.full_name}
              onChangeText={(text) => updateField("full_name", text)}
              error={errors.full_name}
              icon="person"
              autoCapitalize="words"
            />

            <ModernInput
              label="Employee ID"
              placeholder="Optional employee ID"
              value={formData.employee_id}
              onChangeText={(text) => updateField("employee_id", text)}
              icon="card-outline"
              autoCapitalize="none"
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
              <Text style={[styles.loginLinkText, { color: uiTokens.colors.textSecondary }]}>
                Already have an account?
              </Text>
              <AppTouchable onPress={handleBackToLogin} >
                <Text style={[styles.loginLinkButton, { color: uiTokens.colors.accent }]}>
                  Sign in
                </Text>
              </AppTouchable>
            </View>
          </ModernCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  restrictedContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  formCard: {
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  registerButton: {
    marginTop: 8,
  },
  loginLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 24,
    flexWrap: "wrap",
  },
  loginLinkText: {
    fontSize: 14,
    lineHeight: 20,
  },
  loginLinkButton: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
});
