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

import { useAuthStore } from "../src/store/authStore";
import { useSettingsStore } from "../src/store/settingsStore";
import ModernButton from "../src/components/ui/ModernButton";
import ModernCard from "../src/components/ui/ModernCard";
import ModernInput from "../src/components/ui/ModernInput";
import ModernHeader from "../src/components/ui/ModernHeader";
import { BrandLogo } from "../src/components/branding/BrandLogo";
import {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
} from "../src/theme/modernDesign";

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

type LoginResult = {
  success: boolean;
  message?: string;
  code?: string;
};

const getLoginErrorAlert = (
  result: LoginResult,
  mode: LoginMode,
): { title: string; message: string } => {
  if (result.code === "AUTH_SESSION_CONFLICT") {
    return {
      title: "Session Conflict",
      message:
        "This account is already active on another device.\n\nPlease ask your administrator to logout all existing sessions before you can sign in here.",
    };
  }

  if (result.code === "AUTH_INVALID_CREDENTIALS") {
    return mode === "credentials"
      ? {
        title: "Invalid Credentials",
        message: result.message || "Incorrect username or password.",
      }
      : {
        title: "Invalid PIN",
        message: result.message || "Incorrect PIN. Please try again.",
      };
  }

  if (
    result.code === "NETWORK_CONNECTION_ERROR" ||
    result.code === "NETWORK_TIMEOUT" ||
    result.code === "NETWORK_NOT_ALLOWED"
  ) {
    return {
      title: "Connection Issue",
      message:
        result.message ||
        "Unable to connect to server. Check internet and backend connection, then try again.",
    };
  }

  if (result.code === "SERVER_ERROR") {
    return {
      title: "Server Error",
      message: result.message || "Server issue. Please try again in a moment.",
    };
  }

  return {
    title: "Login Failed",
    message:
      result.message ||
      (mode === "credentials"
        ? "Unable to sign in. Please try again."
        : "PIN login failed. Please try again."),
  };
};

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
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
  const logoMaxWidth = Math.min(width - spacing.xl * 2, 280);

  const pinInputRef = React.useRef<TextInput>(null);

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

  const handlePinChange = useCallback(
    async (newPin: string) => {
      // Only allow numeric input
      if (!/^\d*$/.test(newPin)) return;

      // Prevent input while loading
      if (isLoading) return;

      setPin(newPin);
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Small delay to ensure UI updates before freezing for network request
        setTimeout(async () => {
          try {
            const result = await loginWithPin(newPin, lastLoggedUser.username);
            if (!result.success) {
              const alertConfig = getLoginErrorAlert(result, "pin");
              Alert.alert(alertConfig.title, alertConfig.message, [
                { text: "OK" },
              ]);
              setPin("");
            }
          } catch (_error) {
            Alert.alert(
              "Connection Issue",
              "Unable to connect to server. Please try again.",
            );
            setPin("");
          }
        }, 100);
      }
    },
    [pin, loginWithPin, isLoading, lastLoggedUser],
  );

  const handleBiometricAuth = useCallback(async () => {
    if (isLoading) return;
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
  }, [authenticateWithBiometrics, biometricAuthEnabled, isLoading]);

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
          const alertConfig = getLoginErrorAlert(result, "pin");
          Alert.alert(alertConfig.title, alertConfig.message);
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
          const alertConfig = getLoginErrorAlert(result, "credentials");
          Alert.alert(alertConfig.title, alertConfig.message);
          setPassword("");
        }
      }
    } catch (_error) {
      Alert.alert(
        "Connection Issue",
        "Unable to connect to server. Please try again.",
      );
    }
  }, [loginMode, pin, username, password, login, loginWithPin, lastLoggedUser]);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [loginMode, lastLoggedUser]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style="dark" backgroundColor={colors.white} />

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
                      color={colors.primary[500]}
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
              <ModernCard style={styles.loginCard} padding={spacing.lg}>
                {/* Mode Toggle */}
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    onPress={toggleLoginMode}
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
                        loginMode === "pin" ? colors.white : colors.gray[600]
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
                          ? colors.white
                          : colors.gray[600]
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
                            color={colors.primary[500]}
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
                      value={username}
                      onChangeText={setUsername}
                      error={errors.username}
                      autoCapitalize="none"
                      icon="person"
                      disabled={isLoading}
                    />

                    <ModernInput
                      label="Password"
                      placeholder="Enter your password"
                      value={password}
                      onChangeText={setPassword}
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
                    title={isLoading ? "Signing In..." : "Sign In"}
                    onPress={handleLogin}
                    loading={isLoading}
                    disabled={isLoading || !username || !password}
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
    justifyContent: "center",
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: spacing["2xl"],
  },
  welcomeTitle: {
    fontSize: typography.fontSize["3xl"],
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  welcomeSubtitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 24,
  },
  formContainer: {
    marginBottom: spacing.xl,
  },
  loginCard: {
    backgroundColor: colors.white,
  },
  modeToggle: {
    flexDirection: "row",
    marginBottom: spacing.lg,
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.md,
    padding: spacing.xs,
  },
  modeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  modeButtonActive: {
    backgroundColor: colors.primary[500],
    ...shadows.sm,
  },
  modeButtonInactive: {
    backgroundColor: colors.transparent,
  },
  modeButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  modeButtonTextActive: {
    color: colors.white,
  },
  modeButtonTextInactive: {
    color: colors.gray[600],
  },
  formTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  pinDisplay: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing["2xl"],
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  pinDotEmpty: {
    borderColor: colors.gray[300],
    backgroundColor: colors.transparent,
  },
  pinDotFilled: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[500],
  },
  pinDotActive: {
    borderColor: colors.primary[400],
    borderWidth: 2,
    transform: [{ scale: 1.1 }],
  },
  pinDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary[500],
  },
  formSubtitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    color: colors.gray[500],
    textAlign: "center",
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  pinActions: {
    alignItems: "center",
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  biometricButton: {
    alignItems: "center",
    padding: spacing.md,
  },
  biometricText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[600],
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.sm,
  },
  pinBottomActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  actionDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.gray[300],
  },
  switchAccountLink: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[500],
    fontWeight: typography.fontWeight.medium,
  },
  userBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.gray[200],
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  userBadgeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary[50],
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  userBadgeName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[800],
  },
  logoContainer: {
    width: "100%",
    minHeight: 112,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  forgotLink: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[500],
    textDecorationLine: "underline",
  },
  forgotPasswordContainer: {
    alignItems: "center",
    marginTop: spacing.md,
  },
  loginButton: {
    marginTop: spacing.lg,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error[600],
    textAlign: "center",
    marginTop: spacing.sm,
  },
  footer: {
    alignItems: "center",
    gap: spacing.xs,
  },
  versionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[500],
  },
  footerText: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[400],
  },
});
