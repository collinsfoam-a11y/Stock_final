/**
 * Modern Login Screen - Lavanya Mart Stock Verify
 * Clean, accessible login with modern design
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import AuthNoticeCard from "../src/components/auth/AuthNoticeCard";
import { useAuthStore } from "../src/store/authStore";
import { useSettingsStore } from "../src/store/settingsStore";
import ModernButton from "../src/components/ui/ModernButton";
import ModernCard from "../src/components/ui/ModernCard";
import ModernInput from "../src/components/ui/ModernInput";
import ModernHeader from "../src/components/ui/ModernHeader";
import { BrandLogo } from "../src/components/branding/BrandLogo";
import { useThemeContext } from "../src/context/ThemeContext";
import { useAuthRetryCooldown } from "../src/hooks/useAuthRetryCooldown";
import { useRouteNotice } from "../src/hooks/useRouteNotice";
import {
  getAuthRouteNotice,
  getOfflineAuthNotice,
  getLoginErrorNotification,
  pickPreferredAuthNotice,
  type AuthNotification,
} from "../src/utils/authErrorNotifications";
import { getNetworkStatus } from "../src/utils/network";

// Safe Animated View for Web
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

type LoginMode = "pin" | "credentials";

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { theme, themeLegacy, isDark } = useThemeContext();
  const {
    login,
    loginWithPin,
    authenticateWithBiometrics,
    isLoading,
    lastLoggedUser,
  } = useAuthStore();
  const biometricAuthEnabled = useSettingsStore(
    (state) => state.settings.biometricAuth,
  );
  const [loginMode, setLoginMode] = useState<LoginMode>("credentials");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    pin?: string;
    username?: string;
    password?: string;
  }>({});
  const [authNotice, setAuthNotice] = useState<AuthNotification | null>(null);
  const { notice: routeNotice, clearNotice: clearRouteNotice } =
    useRouteNotice(getAuthRouteNotice);
  const { isCooldownActive, remainingSeconds, startCooldown } =
    useAuthRetryCooldown();
  const styles = React.useMemo(
    () => createStyles(theme, themeLegacy),
    [theme, themeLegacy],
  );
  const logoMaxWidth = Math.min(width - themeLegacy.spacing.xl * 2, 280);

  const pinInputRef = React.useRef<TextInput>(null);
  const showAuthNotice = useCallback((notice: AuthNotification | null) => {
    if (!notice) {
      return;
    }

    setAuthNotice((current) => pickPreferredAuthNotice(current, notice));
  }, []);

  const showCooldownNotice = useCallback(() => {
    showAuthNotice(
      getLoginErrorNotification(
        {
          success: false,
          code: "AUTH_RATE_LIMITED",
          retryAfter: remainingSeconds,
        },
        loginMode,
      ),
    );
  }, [loginMode, remainingSeconds, showAuthNotice]);

  React.useEffect(() => {
    if (routeNotice) {
      showAuthNotice(routeNotice);
    }
  }, [routeNotice, showAuthNotice]);

  React.useEffect(() => {
    if (!isCooldownActive) {
      return;
    }

    setAuthNotice((current) =>
      current?.action === "wait"
        ? getLoginErrorNotification(
            {
              success: false,
              code: "AUTH_RATE_LIMITED",
              retryAfter: remainingSeconds,
            },
            loginMode,
          )
        : current,
    );
  }, [isCooldownActive, loginMode, remainingSeconds]);

  // Set initial mode based on last logged user
  React.useEffect(() => {
    const isE2E =
      process.env.EXPO_PUBLIC_E2E === "true" ||
      (Platform.OS === "web" &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("e2e") === "1");
    if (isE2E) {
      return;
    }
    if (lastLoggedUser?.has_pin) {
      setLoginMode("pin");
    }
  }, [lastLoggedUser]);

  const clearFieldError = useCallback((field: "pin" | "username" | "password") => {
    setErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current,
    );
  }, []);

  const handlePinChange = useCallback(
    async (newPin: string) => {
      // Only allow numeric input
      if (!/^\d*$/.test(newPin)) return;

      // Prevent input while loading
      if (isLoading) return;

      setPin(newPin);
      clearFieldError("pin");
      if (newPin.length > pin.length) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Auto-login when 4 digits entered
      if (newPin.length === 4) {
        if (!lastLoggedUser?.username) {
          Alert.alert(
            "First Login Required",
            "Please sign in with username and password first, then set your PIN.",
          );
          setPin("");
          return;
        }
        if (isCooldownActive) {
          showCooldownNotice();
          return;
        }

        if (getNetworkStatus().status === "OFFLINE") {
          showAuthNotice(getOfflineAuthNotice("login"));
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Small delay to ensure UI updates before freezing for network request
        setTimeout(async () => {
          try {
            const result = await loginWithPin(newPin, lastLoggedUser.username);
            if (!result.success) {
              if (result.retryAfter) {
                startCooldown(result.retryAfter);
              }
              showAuthNotice(getLoginErrorNotification(result, "pin"));
              setPin("");
            }
          } catch (_error) {
            showAuthNotice(
              getLoginErrorNotification(
                {
                  success: false,
                  code: "NETWORK_CONNECTION_ERROR",
                },
                "pin",
              ),
            );
            setPin("");
          }
        }, 100);
      }
    },
    [
      clearFieldError,
      isCooldownActive,
      isLoading,
      lastLoggedUser,
      loginWithPin,
      pin,
      showAuthNotice,
      showCooldownNotice,
      startCooldown,
    ],
  );

  const handleBiometricAuth = useCallback(async () => {
    if (isLoading) return;
    if (isCooldownActive) {
      showCooldownNotice();
      return;
    }
    if (getNetworkStatus().status === "OFFLINE") {
      showAuthNotice(getOfflineAuthNotice("login"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!biometricAuthEnabled) {
      Alert.alert(
        "Biometric Unlock Unavailable",
        "Biometric login is not enabled on this device yet.",
      );
      return;
    }

    const result = await authenticateWithBiometrics();
    if (!result.success) {
      Alert.alert(
        "Biometric Login Failed",
        result.message || "Unable to sign in with biometrics.",
      );
    }
  }, [
    authenticateWithBiometrics,
    biometricAuthEnabled,
    isCooldownActive,
    isLoading,
    showAuthNotice,
    showCooldownNotice,
  ]);

  const handleForgotPin = useCallback(() => {
    Alert.alert(
      "Forgot PIN",
      "Please contact your administrator to reset your PIN.",
    );
  }, []);

  const handleForgotPassword = useCallback(() => {
    router.push("/forgot-password");
  }, [router]);

  const handleLogin = useCallback(async () => {
    const newErrors: { pin?: string; username?: string; password?: string } =
      {};
    setErrors(newErrors);
    setAuthNotice(null);

    if (isCooldownActive) {
      showCooldownNotice();
      return;
    }

    if (getNetworkStatus().status === "OFFLINE") {
      showAuthNotice(getOfflineAuthNotice("login"));
      return;
    }

    try {
      if (loginMode === "pin") {
        if (!lastLoggedUser?.username) {
          Alert.alert(
            "First Login Required",
            "Please sign in with username and password first.",
          );
          return;
        }
        if (pin.length !== 4) {
          setErrors({ pin: "Please enter a 4-digit PIN" });
          return;
        }
        const result = await loginWithPin(pin, lastLoggedUser.username);
        if (!result.success) {
          if (result.retryAfter) {
            startCooldown(result.retryAfter);
          }
          showAuthNotice(getLoginErrorNotification(result, "pin"));
          setPin("");
        }
      } else {
        if (!username.trim()) {
          setErrors({ username: "Username is required" });
          return;
        }
        if (!password.trim()) {
          setErrors({ password: "Password is required" });
          return;
        }
        const result = await login(username, password);
        if (!result.success) {
          if (result.retryAfter) {
            startCooldown(result.retryAfter);
          }
          showAuthNotice(getLoginErrorNotification(result, "credentials"));
          setPassword("");
        }
      }
    } catch (_error) {
      showAuthNotice(
        getLoginErrorNotification(
          {
            success: false,
            code: "NETWORK_CONNECTION_ERROR",
          },
          loginMode,
        ),
      );
    }
  }, [
    isCooldownActive,
    lastLoggedUser,
    login,
    loginMode,
    loginWithPin,
    password,
    pin,
    showAuthNotice,
    showCooldownNotice,
    startCooldown,
    username,
  ]);

  const handleNoticeAction = useCallback(() => {
    if (!authNotice?.action) {
      return;
    }

    if (
      authNotice.action === "retry" ||
      authNotice.action === "check_network"
    ) {
      void handleLogin();
      return;
    }

    if (authNotice.action === "switch_to_credentials") {
      setLoginMode("credentials");
      setPin("");
      setErrors({});
      setAuthNotice(null);
    }
  }, [authNotice, handleLogin]);

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

    if (authNotice.action === "switch_to_credentials") {
      return "Use Password Sign-In";
    }

    return undefined;
  }, [authNotice]);

  const toggleLoginMode = useCallback(() => {
    if (loginMode === "credentials" && (!lastLoggedUser || !lastLoggedUser.has_pin)) {
      Alert.alert(
        "First Login Required",
        "Please login with username/password and set a PIN first.",
      );
      return;
    }
    const newMode: LoginMode = loginMode === "pin" ? "credentials" : "pin";
    setLoginMode(newMode);
    setPin("");
    setUsername("");
    setPassword("");
    const newErrors: { pin?: string; username?: string; password?: string } =
      {};
    setErrors(newErrors);
    setAuthNotice(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [loginMode, lastLoggedUser]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={theme.colors.background.default}
      />

      <ModernHeader
        showLogo
        title="Lavanya Mart"
        subtitle="Stock Verification System"
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.contentContainer}>
            {/* Welcome Section */}
            <SafeAnimatedView
              entering={FadeInDown.duration(800).springify()}
              style={styles.welcomeSection}
            >
              {lastLoggedUser && loginMode === "pin" ? (
                <View style={styles.userBadge}>
                  <View style={styles.userBadgeAvatar}>
                    <Ionicons
                      name="person"
                      size={24}
                      color={theme.colors.primary[500]}
                    />
                  </View>
                  <Text style={styles.userBadgeName}>
                    {lastLoggedUser.full_name || lastLoggedUser.username}
                  </Text>
                </View>
              ) : (
                <View style={styles.logoContainer}>
                  <BrandLogo
                    variant="wordmark"
                    maxWidth={logoMaxWidth}
                    maxHeight={96}
                  />
                </View>
              )}
              <Text style={styles.welcomeTitle}>
                {lastLoggedUser && loginMode === "pin"
                  ? "Welcome Back"
                  : "Lavanya Mart"}
              </Text>
              <Text style={styles.welcomeSubtitle}>
                {lastLoggedUser && loginMode === "pin"
                  ? "Scan your fingerprint or enter PIN"
                  : "Secure stock verification for your store team"}
              </Text>
            </SafeAnimatedView>

            {/* Login Form Card */}
            <SafeAnimatedView
              entering={FadeInDown.duration(800).springify()}
              style={styles.formContainer}
            >
              <ModernCard
                style={styles.loginCard}
                padding={themeLegacy.spacing.lg}
              >
                {/* Mode Toggle */}
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    onPress={toggleLoginMode}
                    testID="login-mode-pin"
                    style={[
                      styles.modeButton,
                      loginMode === "pin"
                        ? styles.modeButtonActive
                        : styles.modeButtonInactive,
                    ]}
                  >
                    <Ionicons
                      name="keypad"
                      size={20}
                      color={
                        loginMode === "pin"
                          ? theme.colors.text.inverse
                          : theme.colors.text.secondary
                      }
                    />
                    <Text
                      style={[
                        styles.modeButtonText,
                        loginMode === "pin"
                          ? styles.modeButtonTextActive
                          : styles.modeButtonTextInactive,
                      ]}
                    >
                      PIN
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={toggleLoginMode}
                    testID="login-mode-credentials"
                    style={[
                      styles.modeButton,
                      loginMode === "credentials"
                        ? styles.modeButtonActive
                        : styles.modeButtonInactive,
                    ]}
                  >
                    <Ionicons
                      name="person"
                      size={20}
                      color={
                        loginMode === "credentials"
                          ? theme.colors.text.inverse
                          : theme.colors.text.secondary
                      }
                    />
                    <Text
                      style={[
                        styles.modeButtonText,
                        loginMode === "credentials"
                          ? styles.modeButtonTextActive
                          : styles.modeButtonTextInactive,
                      ]}
                    >
                      Credentials
                    </Text>
                  </TouchableOpacity>
                </View>

                {authNotice ? (
                  <AuthNoticeCard
                    title={authNotice.title}
                    message={authNotice.message}
                    tone={authNotice.tone}
                    actionLabel={noticeActionLabel}
                    onActionPress={noticeActionLabel ? handleNoticeAction : undefined}
                    onDismiss={() => {
                      clearRouteNotice();
                      setAuthNotice(null);
                    }}
                    style={styles.noticeCard}
                    testID="auth-notice-card"
                  />
                ) : null}

                {/* PIN Entry Mode */}
                {loginMode === "pin" && (
                  <>
                    <Text style={styles.formTitle}>Enter Your PIN</Text>
                    <Text style={styles.formSubtitle}>
                      4-digit security code
                    </Text>

                    {/* Hidden Input for Keyboard */}
                    <TextInput
                      ref={pinInputRef}
                      value={pin}
                      onChangeText={handlePinChange}
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.hiddenInput}
                      autoFocus
                      caretHidden
                    />

                    {/* PIN Display - Clickable to focus */}
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => pinInputRef.current?.focus()}
                      style={styles.pinDisplay}
                    >
                      {[0, 1, 2, 3].map((index) => (
                        <SafeAnimatedView
                          key={index}
                          entering={FadeInDown.delay(index * 50).duration(300)}
                          style={[
                            styles.pinDot,
                            pin.length > index
                              ? styles.pinDotFilled
                              : styles.pinDotEmpty,
                            pin.length === index && styles.pinDotActive,
                          ]}
                        >
                          {pin.length > index && (
                            <View style={styles.pinDotInner} />
                          )}
                        </SafeAnimatedView>
                      ))}
                    </TouchableOpacity>

                    {errors.pin && (
                      <Text style={styles.errorText}>{errors.pin}</Text>
                    )}

                    {/* Biometric & Switch Options */}
                    <View style={styles.pinActions}>
                      {biometricAuthEnabled && lastLoggedUser?.has_pin ? (
                        <TouchableOpacity
                          onPress={handleBiometricAuth}
                          style={styles.biometricButton}
                        >
                          <Ionicons
                            name="finger-print"
                            size={44}
                            color={theme.colors.primary[500]}
                          />
                          <Text style={styles.biometricText}>
                            Unlock with Biometrics
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      <View style={styles.pinBottomActions}>
                        <TouchableOpacity onPress={handleForgotPin}>
                          <Text style={styles.forgotLink}>Forgot PIN?</Text>
                        </TouchableOpacity>

                        <View style={styles.actionDivider} />

                        <TouchableOpacity
                          onPress={() => setLoginMode("credentials")}
                        >
                          <Text style={styles.switchAccountLink}>
                            Switch Account
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )}

                {/* Credentials Entry Mode */}
                {loginMode === "credentials" && (
                  <>
                    <Text style={styles.formTitle}>Sign In</Text>

                    <ModernInput
                      label="Username"
                      placeholder="Enter your username"
                      testID="login-username"
                      value={username}
                      onChangeText={(text) => {
                        setUsername(text);
                        clearFieldError("username");
                      }}
                      error={errors.username}
                      autoCapitalize="none"
                      icon="person"
                      disabled={isLoading}
                    />

                    <ModernInput
                      label="Password"
                      placeholder="Enter your password"
                      testID="login-password"
                      value={password}
                      onChangeText={(text) => {
                        setPassword(text);
                        clearFieldError("password");
                      }}
                      error={errors.password}
                      secureTextEntry
                      icon="lock-closed"
                      disabled={isLoading}
                    />

                    <TouchableOpacity
                      onPress={handleForgotPassword}
                      style={styles.forgotPasswordContainer}
                    >
                      <Text style={styles.forgotLink}>Forgot Password?</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Login Button */}
                {loginMode === "credentials" && (
                  <ModernButton
                    title={
                      isLoading
                        ? "Signing In..."
                        : isCooldownActive
                          ? `Try Again in ${remainingSeconds}s`
                          : "Sign In"
                    }
                    onPress={handleLogin}
                    testID="login-submit"
                    loading={isLoading}
                    disabled={isLoading || isCooldownActive || !username || !password}
                    fullWidth
                    style={styles.loginButton}
                    icon="log-in"
                  />
                )}
              </ModernCard>
            </SafeAnimatedView>

            {/* Footer */}
            <Animated.View
              entering={FadeInDown.delay(200).duration(800).springify()}
              style={styles.footer}
            >
              <Text style={styles.versionText}>Version 3.0.0</Text>
              <Text style={styles.footerText}>Secure • Reliable • Fast</Text>
            </Animated.View>
          </View>
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
      justifyContent: "center",
      maxWidth: 400,
      alignSelf: "center",
      width: "100%",
    },
    welcomeSection: {
      alignItems: "center",
      marginBottom: themeLegacy.spacing.xxl,
    },
    welcomeTitle: {
      fontSize: themeLegacy.typography.fontSize["3xl"] ?? 30,
      fontWeight: themeLegacy.typography.fontWeight.bold,
      color: theme.colors.text.primary,
      textAlign: "center",
      marginBottom: themeLegacy.spacing.xs,
    },
    welcomeSubtitle: {
      fontSize: themeLegacy.typography.fontSize.md,
      fontWeight: themeLegacy.typography.fontWeight.normal,
      color: theme.colors.text.secondary,
      textAlign: "center",
      lineHeight: 24,
    },
    formContainer: {
      marginBottom: themeLegacy.spacing.xl,
    },
    loginCard: {
      backgroundColor: themeLegacy.colors.surface,
      borderColor: theme.colors.border.light,
    },
    modeToggle: {
      flexDirection: "row",
      marginBottom: themeLegacy.spacing.lg,
      backgroundColor: theme.colors.background.elevated,
      borderRadius: theme.borderRadius.md,
      padding: themeLegacy.spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border.light,
    },
    modeButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: themeLegacy.spacing.sm,
      paddingHorizontal: themeLegacy.spacing.md,
      borderRadius: theme.borderRadius.sm,
      gap: themeLegacy.spacing.xs,
      minHeight: 44,
    },
    modeButtonActive: {
      backgroundColor: theme.colors.primary[500],
      ...(theme.shadows.sm ?? {}),
    },
    modeButtonInactive: {
      backgroundColor: "transparent",
    },
    modeButtonText: {
      fontSize: themeLegacy.typography.fontSize.sm,
      fontWeight: themeLegacy.typography.fontWeight.medium,
    },
    modeButtonTextActive: {
      color: theme.colors.text.inverse,
    },
    modeButtonTextInactive: {
      color: theme.colors.text.secondary,
    },
    formTitle: {
      fontSize: themeLegacy.typography.fontSize.xl,
      fontWeight: themeLegacy.typography.fontWeight.semibold,
      color: theme.colors.text.primary,
      textAlign: "center",
      marginBottom: themeLegacy.spacing.lg,
    },
    noticeCard: {
      marginBottom: themeLegacy.spacing.lg,
    },
    pinDisplay: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: themeLegacy.spacing.md,
      marginBottom: themeLegacy.spacing.xxl,
    },
    pinDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
    },
    pinDotEmpty: {
      borderColor: theme.colors.border.medium,
      backgroundColor: "transparent",
    },
    pinDotFilled: {
      borderColor: theme.colors.primary[500],
      backgroundColor: theme.colors.primary[500],
    },
    pinDotActive: {
      borderColor: theme.colors.primary[400],
      borderWidth: 2,
      transform: [{ scale: 1.1 }],
    },
    pinDotInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.primary[500],
    },
    formSubtitle: {
      fontSize: themeLegacy.typography.fontSize.sm,
      fontWeight: themeLegacy.typography.fontWeight.normal,
      color: theme.colors.text.secondary,
      textAlign: "center",
      marginTop: -themeLegacy.spacing.sm,
      marginBottom: themeLegacy.spacing.lg,
    },
    hiddenInput: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0,
    },
    pinActions: {
      alignItems: "center",
      gap: themeLegacy.spacing.xl,
      marginTop: themeLegacy.spacing.lg,
    },
    biometricButton: {
      alignItems: "center",
      padding: themeLegacy.spacing.md,
    },
    biometricText: {
      fontSize: themeLegacy.typography.fontSize.sm,
      color: theme.colors.primary[600],
      fontWeight: themeLegacy.typography.fontWeight.medium,
      marginTop: themeLegacy.spacing.sm,
    },
    pinBottomActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: themeLegacy.spacing.md,
    },
    actionDivider: {
      width: 1,
      height: 14,
      backgroundColor: theme.colors.border.light,
    },
    switchAccountLink: {
      fontSize: themeLegacy.typography.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: themeLegacy.typography.fontWeight.medium,
    },
    userBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: themeLegacy.colors.surface,
      paddingHorizontal: themeLegacy.spacing.md,
      paddingVertical: themeLegacy.spacing.sm,
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      marginBottom: themeLegacy.spacing.md,
      ...(theme.shadows.sm ?? {}),
    },
    userBadgeAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: themeLegacy.colors.overlayPrimary,
      justifyContent: "center",
      alignItems: "center",
      marginRight: themeLegacy.spacing.sm,
    },
    userBadgeName: {
      fontSize: themeLegacy.typography.fontSize.sm,
      fontWeight: themeLegacy.typography.fontWeight.semibold,
      color: theme.colors.text.primary,
    },
    logoContainer: {
      width: "100%",
      minHeight: 112,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: themeLegacy.spacing.lg,
    },
    forgotLink: {
      fontSize: themeLegacy.typography.fontSize.sm,
      color: theme.colors.text.secondary,
      textDecorationLine: "underline",
    },
    forgotPasswordContainer: {
      alignItems: "center",
      marginTop: themeLegacy.spacing.md,
    },
    loginButton: {
      marginTop: themeLegacy.spacing.lg,
    },
    errorText: {
      fontSize: themeLegacy.typography.fontSize.sm,
      color: theme.colors.error.dark,
      textAlign: "center",
      marginTop: themeLegacy.spacing.sm,
    },
    footer: {
      alignItems: "center",
      gap: themeLegacy.spacing.xs,
    },
    versionText: {
      fontSize: themeLegacy.typography.fontSize.sm,
      fontWeight: themeLegacy.typography.fontWeight.medium,
      color: theme.colors.text.secondary,
    },
    footerText: {
      fontSize: themeLegacy.typography.fontSize.sm,
      color: theme.colors.text.tertiary,
    },
  });
