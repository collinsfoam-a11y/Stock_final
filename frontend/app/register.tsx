import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";

import AuthNoticeCard from "@/components/auth/AuthNoticeCard";
import { AppLogo } from "@/components/AppLogo";
import { useAuthRetryCooldown } from "@/hooks/useAuthRetryCooldown";
import { usePublicRegistrationAvailability } from "@/bootstrap/usePublicRegistrationAvailability";
import { registerUser } from "@/services/api/api";
import { useAuthStore } from "@/store/authStore";
import {
  getRegistrationErrorNotification,
  getRegistrationFieldErrors,
  getOfflineAuthNotice,
  pickPreferredAuthNotice,
  type AuthNotification,
  type RegistrationFieldErrors,
} from "@/utils/authErrorNotifications";
import { normalizeAuthApiError } from "@/utils/authApiErrors";
import { getNetworkStatus } from "@/utils/network";
import { getRouteForRole, type UserRole } from "@/utils/roleNavigation";

type RegisterFormData = {
  username: string;
  password: string;
  confirmPassword: string;
  full_name: string;
  employee_id: string;
  phone: string;
};

type RegisterField = keyof RegisterFormData;

const INITIAL_FORM_DATA: RegisterFormData = {
  username: "",
  password: "",
  confirmPassword: "",
  full_name: "",
  employee_id: "",
  phone: "",
};

const USERNAME_TAKEN_MESSAGE =
  "That username is already in use. Choose a different username and try again.";

const hasFieldErrors = (fieldErrors: RegistrationFieldErrors): boolean =>
  Object.values(fieldErrors).some((value) => Boolean(value));

const getLocalValidationErrors = (
  formData: RegisterFormData,
): RegistrationFieldErrors => {
  const nextErrors: RegistrationFieldErrors = {};

  if (!formData.username.trim()) {
    nextErrors.username = "Username is required.";
  }

  if (!formData.full_name.trim()) {
    nextErrors.full_name = "Full Name is required.";
  }

  if (!formData.password) {
    nextErrors.password = "Password is required.";
  } else if (formData.password.length < 6) {
    nextErrors.password = "Password must be at least 6 characters.";
  }

  if (!formData.confirmPassword) {
    nextErrors.confirmPassword = "Confirm Password is required.";
  } else if (formData.password !== formData.confirmPassword) {
    nextErrors.confirmPassword = "Passwords do not match.";
  }

  return nextErrors;
};

export default function Register() {
  const [formData, setFormData] = React.useState(INITIAL_FORM_DATA);
  const [fieldErrors, setFieldErrors] = React.useState<RegistrationFieldErrors>(
    {},
  );
  const [authNotice, setAuthNotice] = React.useState<AuthNotification | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const router = useRouter();
  const establishSession = useAuthStore((state) => state.establishSession);
  const waitForHydration = useAuthStore((state) => state.waitForHydration);
  const { status: registrationStatus, publicRegistrationAllowed } =
    usePublicRegistrationAvailability();
  const redirectHandledRef = React.useRef(false);
  const { isCooldownActive, remainingSeconds, startCooldown } =
    useAuthRetryCooldown();

  const showAuthNotice = React.useCallback((notice: AuthNotification | null) => {
    if (!notice) {
      return;
    }

    setAuthNotice((current) => pickPreferredAuthNotice(current, notice));
  }, []);

  const redirectToLogin = React.useCallback(() => {
    router.replace("/login");
  }, [router]);

  const redirectToLoginWithNotice = React.useCallback(() => {
    router.replace("/login?notice=registration_closed");
  }, [router]);

  React.useEffect(() => {
    if (registrationStatus !== "ready") {
      return;
    }

    if (!publicRegistrationAllowed && !redirectHandledRef.current) {
      redirectHandledRef.current = true;
      redirectToLoginWithNotice();
      return;
    }

    if (publicRegistrationAllowed) {
      redirectHandledRef.current = false;
    }
  }, [
    publicRegistrationAllowed,
    redirectToLoginWithNotice,
    registrationStatus,
  ]);

  React.useEffect(() => {
    if (!isCooldownActive) {
      return;
    }

    setAuthNotice((current) =>
      current?.action === "wait"
        ? getRegistrationErrorNotification({
            response: {
              status: 429,
              data: {
                detail: {
                  code: "RATE_LIMIT_ERROR",
                  message: "Too many registration attempts",
                  retry_after: remainingSeconds,
                },
              },
            },
          })
        : current,
    );
  }, [isCooldownActive, remainingSeconds]);

  React.useEffect(() => {
    if (registrationStatus !== "error") {
      return;
    }

    const offlineNotice =
      getNetworkStatus().status === "OFFLINE"
        ? getOfflineAuthNotice("register")
        : {
            title: "Can't Verify Account Setup",
            message:
              "We couldn't confirm whether account creation is available. Check the store network or sign in with an existing account.",
            action: "check_network" as const,
            tone: "warning" as const,
          };

    showAuthNotice(offlineNotice);
  }, [registrationStatus, showAuthNotice]);

  const updateField = React.useCallback(
    (field: RegisterField, value: string) => {
      setFormData((current) => ({ ...current, [field]: value }));
      setFieldErrors((current) => {
        let changed = false;
        let nextErrors = current;

        if (current[field as keyof RegistrationFieldErrors]) {
          nextErrors = {
            ...nextErrors,
            [field]: undefined,
          };
          changed = true;
        }

        if (
          (field === "password" || field === "confirmPassword") &&
          current.confirmPassword
        ) {
          nextErrors = {
            ...nextErrors,
            confirmPassword: undefined,
          };
          changed = true;
        }

        return changed ? nextErrors : current;
      });
    },
    [],
  );

  const handleRegister = React.useCallback(async () => {
    if (registrationStatus === "loading") {
      showAuthNotice({
        title: "Checking Account Setup",
        message:
          "Please wait while we confirm whether account creation is available.",
        action: null,
        tone: "info",
      });
      return;
    }

    if (registrationStatus === "error") {
      showAuthNotice(
        getNetworkStatus().status === "OFFLINE"
          ? getOfflineAuthNotice("register")
          : {
              title: "Can't Verify Account Setup",
              message:
                "We couldn't confirm whether account creation is available. Check the store network or sign in with an existing account.",
              action: "check_network",
              tone: "warning",
            },
      );
      return;
    }

    if (!publicRegistrationAllowed) {
      redirectToLoginWithNotice();
      return;
    }

    if (isCooldownActive) {
      showAuthNotice(
        getRegistrationErrorNotification({
          response: {
            status: 429,
            data: {
              detail: {
                code: "RATE_LIMIT_ERROR",
                message: "Too many registration attempts",
                retry_after: remainingSeconds,
              },
            },
          },
        }),
      );
      return;
    }

    if (getNetworkStatus().status === "OFFLINE") {
      showAuthNotice(getOfflineAuthNotice("register"));
      return;
    }

    const validationErrors = getLocalValidationErrors(formData);
    if (hasFieldErrors(validationErrors)) {
      setFieldErrors(validationErrors);
      showAuthNotice({
        title: "Check Your Details",
        message: "Fix the highlighted fields and try again.",
        action: "fix_form",
        tone: "warning",
      });
      return;
    }

    try {
      setLoading(true);
      setAuthNotice(null);
      setFieldErrors({});

      const response = await registerUser({
        username: formData.username.trim(),
        password: formData.password,
        full_name: formData.full_name.trim(),
        employee_id: formData.employee_id.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      });

      if (!response.user || !response.access_token) {
        throw new Error(
          "Registration succeeded but did not return a valid session.",
        );
      }

      await establishSession({
        ...response,
        user: {
          ...response.user,
          role: response.user.role as UserRole,
        },
      });
      await waitForHydration();

      const targetRoute = getRouteForRole(response.user.role as UserRole);
      router.replace(targetRoute as any);
    } catch (error: any) {
      const notification = getRegistrationErrorNotification(error);
      const backendFieldErrors = getRegistrationFieldErrors(error);
      const normalizedError = normalizeAuthApiError(error);

      if (
        notification.action === "change_username" &&
        !backendFieldErrors.username
      ) {
        backendFieldErrors.username = USERNAME_TAKEN_MESSAGE;
      }

      if (hasFieldErrors(backendFieldErrors)) {
        setFieldErrors((current) => ({
          ...current,
          ...backendFieldErrors,
        }));
      }

      if (normalizedError.retryAfter) {
        startCooldown(normalizedError.retryAfter);
      }

      showAuthNotice(notification);

      if (__DEV__) {
        console.log("Registration request failed", {
          status: error.response?.status,
          code:
            error.response?.data?.code ??
            error.response?.data?.detail?.code ??
            error.response?.data?.detail?.error,
          detail: error.response?.data?.detail ?? error.response?.data,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [
    establishSession,
    formData,
    isCooldownActive,
    publicRegistrationAllowed,
    redirectToLoginWithNotice,
    registrationStatus,
    remainingSeconds,
    router,
    showAuthNotice,
    startCooldown,
    waitForHydration,
  ]);

  const handleNoticeAction = React.useCallback(() => {
    if (!authNotice?.action) {
      return;
    }

    if (
      authNotice.action === "retry" ||
      authNotice.action === "check_network"
    ) {
      void handleRegister();
      return;
    }

    if (authNotice.action === "change_username") {
      setFormData((current) => ({ ...current, username: "" }));
      setFieldErrors((current) => ({
        ...current,
        username: undefined,
      }));
      setAuthNotice(null);
      return;
    }

    if (authNotice.action === "sign_in") {
      redirectToLoginWithNotice();
    }
  }, [authNotice, handleRegister, redirectToLoginWithNotice]);

  const noticeActionLabel = React.useMemo(() => {
    if (!authNotice?.action) {
      return undefined;
    }

    if (
      authNotice.action === "retry" ||
      authNotice.action === "check_network"
    ) {
      return "Try Again";
    }

    if (authNotice.action === "change_username") {
      return "Edit Username";
    }

    if (authNotice.action === "sign_in") {
      return "Go to Sign In";
    }

    return undefined;
  }, [authNotice]);

  const isRegistrationClosed =
    registrationStatus === "ready" && !publicRegistrationAllowed;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style="light" />
      <LinearGradient
        colors={["#1a1a1a", "#0d0d0d", "#000000"]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <AppLogo size="medium" showText variant="default" />
          <Text style={styles.subtitle}>
            {publicRegistrationAllowed
              ? "Join the Stock Verification Team"
              : "Sign in or ask an administrator for access"}
          </Text>
        </View>

        <View style={styles.form}>
          {registrationStatus === "loading" ? (
            <View style={styles.infoCard}>
              <Ionicons
                name="time-outline"
                size={22}
                color="#9ca3af"
                style={styles.infoIcon}
              />
              <Text style={styles.infoTitle}>Checking account setup</Text>
              <Text style={styles.infoText}>
                Confirming whether first-user registration is still available.
              </Text>
            </View>
          ) : registrationStatus === "error" ? (
            <>
              {authNotice ? (
                <AuthNoticeCard
                  title={authNotice.title}
                  message={authNotice.message}
                  tone={authNotice.tone}
                  actionLabel={noticeActionLabel}
                  onActionPress={noticeActionLabel ? handleNoticeAction : undefined}
                  onDismiss={() => setAuthNotice(null)}
                  style={styles.noticeCard}
                  testID="auth-notice-card"
                />
              ) : null}
              <View style={styles.infoCard}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={22}
                  color="#f59e0b"
                  style={styles.infoIcon}
                />
                <Text style={styles.infoTitle}>Can&apos;t verify account setup</Text>
                <Text style={styles.infoText}>
                  Check the store network or sign in with an existing account.
                </Text>
              </View>
            </>
          ) : isRegistrationClosed ? (
            <View style={styles.infoCard}>
              <Ionicons
                name="log-in-outline"
                size={22}
                color="#60a5fa"
                style={styles.infoIcon}
              />
              <Text style={styles.infoTitle}>Redirecting to sign in</Text>
              <Text style={styles.infoText}>
                Public registration is closed for this workspace. Use the sign-in
                screen and ask an administrator to create your account.
              </Text>
            </View>
          ) : (
            <>
              {authNotice ? (
                <AuthNoticeCard
                  title={authNotice.title}
                  message={authNotice.message}
                  tone={authNotice.tone}
                  actionLabel={noticeActionLabel}
                  onActionPress={noticeActionLabel ? handleNoticeAction : undefined}
                  onDismiss={() => setAuthNotice(null)}
                  style={styles.noticeCard}
                  testID="auth-notice-card"
                />
              ) : null}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Username <Text style={styles.required}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    fieldErrors.username ? styles.inputContainerError : null,
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color="#888"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={formData.username}
                    onChangeText={(text) => updateField("username", text)}
                    placeholder="Enter username"
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {fieldErrors.username ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.username}</Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Full Name <Text style={styles.required}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    fieldErrors.full_name ? styles.inputContainerError : null,
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={20}
                    color="#888"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={formData.full_name}
                    onChangeText={(text) => updateField("full_name", text)}
                    placeholder="Enter your full name"
                    placeholderTextColor="#666"
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
                {fieldErrors.full_name ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.full_name}</Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Employee ID</Text>
                <View
                  style={[
                    styles.inputContainer,
                    fieldErrors.employee_id ? styles.inputContainerError : null,
                  ]}
                >
                  <Ionicons
                    name="card-outline"
                    size={20}
                    color="#888"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={formData.employee_id}
                    onChangeText={(text) => updateField("employee_id", text)}
                    placeholder="Enter employee ID (optional)"
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {fieldErrors.employee_id ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.employee_id}</Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone Number</Text>
                <View
                  style={[
                    styles.inputContainer,
                    fieldErrors.phone ? styles.inputContainerError : null,
                  ]}
                >
                  <Ionicons
                    name="call-outline"
                    size={20}
                    color="#888"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={formData.phone}
                    onChangeText={(text) => updateField("phone", text)}
                    placeholder="Enter phone number (optional)"
                    placeholderTextColor="#666"
                    autoCorrect={false}
                    keyboardType="phone-pad"
                  />
                </View>
                {fieldErrors.phone ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.phone}</Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Password <Text style={styles.required}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    fieldErrors.password ? styles.inputContainerError : null,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="#888"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={formData.password}
                    onChangeText={(text) => updateField("password", text)}
                    placeholder="Enter password (min 6 characters)"
                    placeholderTextColor="#666"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((current) => !current)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={showPassword ? "eye-outline" : "eye-off-outline"}
                      size={20}
                      color="#888"
                    />
                  </TouchableOpacity>
                </View>
                {fieldErrors.password ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Confirm Password <Text style={styles.required}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    fieldErrors.confirmPassword ? styles.inputContainerError : null,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="#888"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={formData.confirmPassword}
                    onChangeText={(text) => updateField("confirmPassword", text)}
                    placeholder="Re-enter password"
                    placeholderTextColor="#666"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword((current) => !current)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={
                        showConfirmPassword ? "eye-outline" : "eye-off-outline"
                      }
                      size={20}
                      color="#888"
                    />
                  </TouchableOpacity>
                </View>
                {fieldErrors.confirmPassword ? (
                  <Text style={styles.fieldErrorText}>
                    {fieldErrors.confirmPassword}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.registerButton, loading && styles.buttonDisabled]}
                onPress={() => {
                  void handleRegister();
                }}
                disabled={loading || isCooldownActive}
              >
                <Text style={styles.registerButtonText}>
                  {loading
                    ? "Creating Account..."
                    : isCooldownActive
                      ? `Try Again in ${remainingSeconds}s`
                      : "Create Account"}
                </Text>
              </TouchableOpacity>

              <View style={styles.loginLink}>
                <Text style={styles.loginLinkText}>
                  Already have an account?{" "}
                </Text>
                <TouchableOpacity onPress={redirectToLogin}>
                  <Text style={styles.loginLinkButton}>Login</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  scrollContent: {
    flexGrow: 1,
    ...(Platform.OS === "web"
      ? {
          maxWidth: 500,
          width: "100%",
          alignSelf: "center",
          paddingTop: 40,
          paddingBottom: 40,
        }
      : {}),
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 32,
    backgroundColor: "#2a2a2a",
    ...(Platform.OS === "web"
      ? {
          borderRadius: 12,
          marginTop: 20,
        }
      : {}),
  },
  backButton: {
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
  },
  form: {
    padding: 24,
  },
  infoCard: {
    backgroundColor: "#202020",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#333",
    padding: 20,
  },
  infoIcon: {
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 10,
  },
  infoText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#b3b3b3",
  },
  noticeCard: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ccc",
    marginBottom: 8,
  },
  required: {
    color: "#FF5252",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    paddingHorizontal: 12,
  },
  inputContainerError: {
    borderColor: "#ef4444",
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    color: "#fff",
    fontSize: 16,
  },
  eyeIcon: {
    padding: 8,
  },
  fieldErrorText: {
    marginTop: 8,
    color: "#fca5a5",
    fontSize: 13,
    lineHeight: 18,
  },
  registerButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  loginLink: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  loginLinkText: {
    color: "#888",
    fontSize: 14,
  },
  loginLinkButton: {
    color: "#4CAF50",
    fontSize: 14,
    fontWeight: "bold",
  },
});
