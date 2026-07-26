/**
 * Modern Login Screen - Lavanya Mart Stock Verify
 * Clean, accessible login with modern design
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
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
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { haptics } from "@/services/haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import ModernButton from "@/components/ui/ModernButton";
import ModernCard from "@/components/ui/ModernCard";
import ModernInput from "@/components/ui/ModernInput";
import ModernHeader from "@/components/ui/ModernHeader";
import { useAppVersion } from "@/hooks/useAppVersion";
import { BrandLogo } from "@/components/branding/BrandLogo";
import {
  colors as unifiedColors,
  semanticColors,
  spacing as unifiedSpacing,
  radius as unifiedRadius,
  textStyles,
  shadows,
} from "@/theme/legacyCompat";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from '@/theme/staffUiScale';
import { duration } from "@/theme/staffUiScale";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoginMode = "pin" | "credentials";

type LoginResult = {
  success: boolean;
  message?: string;
  code?: string;
};

type FormErrors = {
  pin?: string;
  username?: string;
  password?: string;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getLoginErrorAlert = (
  result: LoginResult,
  mode: LoginMode
): { title: string; message: string } => {
  switch (result.code) {
    case "AUTH_SESSION_CONFLICT":
      return {
        title: "Session Conflict",
        message:
          "This account is already active on another device.\n\nPlease ask your administrator to logout all existing sessions before you can sign in here.",
      };
    case "AUTH_INVALID_CREDENTIALS":
      return mode === "credentials"
        ? {
            title: "Invalid Credentials",
            message: result.message || "Incorrect username or password.",
          }
        : {
            title: "Invalid PIN",
            message: result.message || "Incorrect PIN. Please try again.",
          };
    case "NETWORK_CONNECTION_ERROR":
    case "NETWORK_TIMEOUT":
    case "NETWORK_NOT_ALLOWED":
      return {
        title: "Connection Issue",
        message:
          result.message ||
          "Unable to connect to server. Check internet and backend connection, then try again.",
      };
    case "SERVER_ERROR":
      return {
        title: "Server Error",
        message: result.message || "Server issue. Please try again in a moment.",
      };
    default:
      return {
        title: "Login Failed",
        message:
          result.message ||
          (mode === "credentials"
            ? "Unable to sign in. Please try again."
            : "PIN login failed. Please try again."),
      };
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginScreen() {
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { version } = useAppVersion();

  const {
    login,
    loginWithPin,
    authenticateWithBiometrics,
    isLoading,
    lastLoggedUser,
  } = useAuthStore();

  const biometricAuthEnabled = useSettingsStore(
    (state) => state.settings.biometricAuth
  );

  const [loginMode, setLoginMode] = useState<LoginMode>("credentials");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);

  const pinInputRef = useRef<TextInput>(null);
  const autoLoginTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPinLength = useRef(0);

  const logoMaxWidth = Math.min(width - unifiedSpacing.xl * 2, 280);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Set initial mode based on last logged user
  useEffect(() => {
    const isE2E =
      process.env.EXPO_PUBLIC_E2E === "true" ||
      (Platform.OS === "web" &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("e2e") === "1");
    if (!isE2E && lastLoggedUser?.has_pin) {
      setLoginMode("pin");
    }
  }, [lastLoggedUser]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoLoginTimeoutRef.current) {
        clearTimeout(autoLoginTimeoutRef.current);
      }
    };
  }, []);

  // Keep focus on PIN input when in PIN mode
  useEffect(() => {
    if (loginMode === "pin" && !isLoading) {
      const timer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loginMode, isLoading]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handlePinChange = useCallback(
    async (newPin: string) => {
      if (!/^\d*$/.test(newPin) || isLoading) return;

      const previousLength = prevPinLength.current;
      prevPinLength.current = newPin.length;

      setPin(newPin);

      if (newPin.length > previousLength) {
        haptics.light();
      }

      // Auto-login when 4 digits entered
      if (newPin.length === 4) {
        if (!lastLoggedUser?.username) {
          Alert.alert(
            "First Login Required",
            "Please sign in with username and password first, then set your PIN."
          );
          setPin("");
          prevPinLength.current = 0;
          return;
        }

        haptics.success();

        autoLoginTimeoutRef.current = setTimeout(async () => {
          try {
            const result = await loginWithPin(newPin, lastLoggedUser.username);
            if (!result.success) {
              const alertConfig = getLoginErrorAlert(result, "pin");
              Alert.alert(alertConfig.title, alertConfig.message, [{ text: "OK" }]);
              setPin("");
              prevPinLength.current = 0;
            }
          } catch {
            Alert.alert(
              "Connection Issue",
              "Unable to connect to server. Please try again."
            );
            setPin("");
            prevPinLength.current = 0;
          }
        }, 150);
      }
    },
    [isLoading, lastLoggedUser, loginWithPin]
  );

  const handleBiometricAuth = useCallback(async () => {
    if (isLoading || isBiometricLoading) return;
    haptics.medium();

    if (!biometricAuthEnabled) {
      Alert.alert(
        "Biometric Unlock Unavailable",
        "Biometric login is not enabled on this device yet."
      );
      return;
    }

    setIsBiometricLoading(true);
    try {
      const result = await authenticateWithBiometrics();
      if (!result.success) {
        Alert.alert(
          "Biometric Login Failed",
          result.message || "Unable to sign in with biometrics."
        );
      }
    } finally {
      setIsBiometricLoading(false);
    }
  }, [authenticateWithBiometrics, biometricAuthEnabled, isLoading, isBiometricLoading]);

  const handleForgotPin = useCallback(() => {
    Alert.alert("Forgot PIN", "Please contact your administrator to reset your PIN.");
  }, []);

  const handleForgotPassword = useCallback(() => {
    router.push("/forgot-password");
  }, [router]);

  const handleLogin = useCallback(async () => {
    const newErrors: FormErrors = {};
    setErrors(newErrors);

    try {
      if (loginMode === "pin") {
        if (!lastLoggedUser?.username) {
          Alert.alert(
            "First Login Required",
            "Please sign in with username and password first."
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
          prevPinLength.current = 0;
        }
      } else {
        let hasError = false;
        if (!username.trim()) {
          newErrors.username = "Username is required";
          hasError = true;
        }
        if (!password.trim()) {
          newErrors.password = "Password is required";
          hasError = true;
        }
        if (hasError) {
          setErrors(newErrors);
          return;
        }

        const result = await login(username, password);
        if (!result.success) {
          const alertConfig = getLoginErrorAlert(result, "credentials");
          Alert.alert(alertConfig.title, alertConfig.message);
          setPassword("");
        }
      }
    } catch (error) {
      Alert.alert("Connection Issue", "Unable to connect to server. Please try again.");
    }
  }, [loginMode, pin, username, password, login, loginWithPin, lastLoggedUser]);

  const switchToMode = useCallback(
    (mode: LoginMode) => {
      if (mode === loginMode) return;

      if (mode === "pin" && (!lastLoggedUser || !lastLoggedUser.has_pin)) {
        Alert.alert(
          "First Login Required",
          "Please login with username/password and set a PIN first."
        );
        return;
      }

      setLoginMode(mode);
      setPin("");
      prevPinLength.current = 0;
      setUsername("");
      setPassword("");
      setErrors({});
      haptics.light();
    },
    [loginMode, lastLoggedUser]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isPinMode = loginMode === "pin";
  const showUserBadge = lastLoggedUser && isPinMode;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />

      <ModernHeader showLogo title="Lavanya Mart" subtitle="Stock Verification System" />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
        >
          <View style={styles.contentContainer}>
            {/* Welcome Section */}
            <SafeAnimatedView entering={FadeInDown} style={styles.welcomeSection}>
              {showUserBadge ? (
                <View style={styles.userBadge}>
                  <View style={styles.userBadgeAvatar}>
                    <Ionicons
                      name="person"
                      size={24}
                      color={uiTokens.colors.accent}
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
                {showUserBadge ? "Welcome Back" : "Lavanya Mart"}
              </Text>
              <Text style={styles.welcomeSubtitle}>
                {showUserBadge
                  ? "Scan your fingerprint or enter PIN"
                  : "Secure stock verification for your store team"}
              </Text>
            </SafeAnimatedView>

            {/* Login Form Card */}
            <SafeAnimatedView
              entering={FadeInDown}
              delay={100}
              style={styles.formContainer}
            >
              <ModernCard style={styles.loginCard} padding={unifiedSpacing.lg}>
                {/* Mode Toggle */}
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    onPress={() => switchToMode("pin")}
                    activeOpacity={0.8}
                    style={[
                      styles.modeButton,
                      isPinMode ? styles.modeButtonActive : styles.modeButtonInactive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="PIN login mode"
                    accessibilityState={{ selected: isPinMode }}
                  >
                    <Ionicons
                      name="keypad"
                      size={20}
                      color={
                        isPinMode ? unifiedColors.white : uiTokens.colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.modeButtonText,
                        isPinMode
                          ? styles.modeButtonTextActive
                          : styles.modeButtonTextInactive,
                      ]}
                    >
                      PIN
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => switchToMode("credentials")}
                    activeOpacity={0.8}
                    style={[
                      styles.modeButton,
                      !isPinMode ? styles.modeButtonActive : styles.modeButtonInactive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Credentials login mode"
                    accessibilityState={{ selected: !isPinMode }}
                  >
                    <Ionicons
                      name="person"
                      size={20}
                      color={
                        !isPinMode
                          ? unifiedColors.white
                          : uiTokens.colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.modeButtonText,
                        !isPinMode
                          ? styles.modeButtonTextActive
                          : styles.modeButtonTextInactive,
                      ]}
                    >
                      Credentials
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* PIN Entry Mode */}
                {isPinMode && (
                  <>
                    <Text style={styles.formTitle}>Enter Your PIN</Text>
                    <Text style={styles.formSubtitle}>4-digit security code</Text>

                    {/* Hidden Input for Keyboard */}
                    <TextInput
                      ref={pinInputRef}
                      value={pin}
                      onChangeText={handlePinChange}
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.hiddenInput}
                      autoFocus={Platform.OS !== "web"}
                      caretHidden
                      secureTextEntry
                      accessibilityLabel="PIN entry"
                      accessibilityRole="text"
                      accessibilityValue={{ text: `${pin.length} of 4 digits entered` }}
                      editable={!isLoading}
                    />

                    {/* PIN Display */}
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => pinInputRef.current?.focus()}
                      style={styles.pinDisplay}
                      accessibilityLabel="PIN display. Tap to enter PIN."
                      accessibilityRole="text"
                    >
                      {[0, 1, 2, 3].map((index) => (
                        <SafeAnimatedView
                          key={index}
                          entering={FadeInDown}
                          delay={index * 50}
                        >
                          <View
                            style={[
                              styles.pinDot,
                              pin.length > index
                                ? styles.pinDotFilled
                                : styles.pinDotEmpty,
                              pin.length === index && !isLoading
                                ? styles.pinDotActive
                                : null,
                            ]}
                          >
                            {pin.length > index && (
                              <View style={styles.pinDotInner} />
                            )}
                          </View>
                        </SafeAnimatedView>
                      ))}
                    </TouchableOpacity>

                    {isLoading && (
                      <ActivityIndicator
                        size="small"
                        color={uiTokens.colors.accent}
                        style={styles.pinLoading}
                      />
                    )}

                    {errors.pin && !isLoading && (
                      <Text style={styles.errorText}>{errors.pin}</Text>
                    )}

                    {/* Biometric & Switch Options */}
                    <View style={styles.pinActions}>
                      {biometricAuthEnabled && lastLoggedUser?.has_pin ? (
                        <TouchableOpacity
                          onPress={handleBiometricAuth}
                          style={styles.biometricButton}
                          disabled={isBiometricLoading}
                          accessibilityRole="button"
                          accessibilityLabel="Unlock with biometrics"
                        >
                          {isBiometricLoading ? (
                            <ActivityIndicator
                              size="large"
                              color={uiTokens.colors.accent}
                            />
                          ) : (
                            <Ionicons
                              name="finger-print"
                              size={44}
                              color={uiTokens.colors.accent}
                            />
                          )}
                          <Text style={styles.biometricText}>
                            {isBiometricLoading
                              ? "Authenticating..."
                              : "Unlock with Biometrics"}
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      <View style={styles.pinBottomActions}>
                        <TouchableOpacity
                          onPress={handleForgotPin}
                          accessibilityRole="button"
                        >
                          <Text style={styles.forgotLink}>Forgot PIN?</Text>
                        </TouchableOpacity>

                        <View style={styles.actionDivider} />

                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Switch to credentials login mode"
                          onPress={() => switchToMode("credentials")}
                        >
                          <Text style={styles.switchAccountLink}>Switch Account</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )}

                {/* Credentials Entry Mode */}
                {!isPinMode && (
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
                      showClearButton
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
                      accessibilityRole="link"
                    >
                      <Text style={styles.forgotLink}>Forgot Password?</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Login Button */}
                {!isPinMode && (
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
            <SafeAnimatedView entering={FadeInDown} delay={200} style={styles.footer}>
              <Text style={styles.versionText}>Version {version}</Text>
              <Text style={styles.footerText}>Secure • Reliable • Fast</Text>
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
    },
    welcomeTitle: {
      ...textStyles.h3,
      color: tokens.colors.textPrimary,
      textAlign: "center",
      marginBottom: unifiedSpacing.xs,
    },
    welcomeSubtitle: {
      ...textStyles.body,
      color: tokens.colors.textSecondary,
      textAlign: "center",
      lineHeight: 24,
    },
    formContainer: {
      marginBottom: unifiedSpacing.xl,
    },
    loginCard: {
      backgroundColor: tokens.colors.surface,
    },
    modeToggle: {
      flexDirection: "row",
      marginBottom: unifiedSpacing.lg,
      backgroundColor: colorWithAlpha(tokens.colors.textMuted, 0.12),
      borderRadius: unifiedRadius.md,
      padding: unifiedSpacing.xs,
    },
    modeButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: unifiedSpacing.sm,
      paddingHorizontal: unifiedSpacing.md,
      borderRadius: unifiedRadius.sm,
      gap: unifiedSpacing.xs,
    },
    modeButtonActive: {
      backgroundColor: tokens.colors.accent,
      ...shadows.sm,
    },
    modeButtonInactive: {
      backgroundColor: unifiedColors.transparent,
    },
    modeButtonText: {
      ...textStyles.caption,
      fontWeight: "500",
    },
    modeButtonTextActive: {
      color: unifiedColors.white,
    },
    modeButtonTextInactive: {
      color: tokens.colors.textSecondary,
    },
    formTitle: {
      ...textStyles.h5,
      color: tokens.colors.textPrimary,
      textAlign: "center",
      marginBottom: unifiedSpacing.lg,
    },
    pinDisplay: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: unifiedSpacing.md,
      marginBottom: unifiedSpacing.lg,
    },
    pinDot: {
      width: 18,
      height: 18,
      borderRadius: radius.sm,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
    },
    pinDotEmpty: {
      borderColor: tokens.colors.border,
      backgroundColor: unifiedColors.transparent,
    },
    pinDotFilled: {
      borderColor: tokens.colors.accent,
      backgroundColor: tokens.colors.accent,
    },
    pinDotActive: {
      borderColor: tokens.colors.accent,
      borderWidth: 2.5,
      transform: [{ scale: 1.15 }],
    },
    pinDotInner: {
      width: 8,
      height: 8,
      borderRadius: radius.xs,
      backgroundColor: unifiedColors.white,
    },
    pinLoading: {
      marginBottom: unifiedSpacing.md,
    },
    formSubtitle: {
      ...textStyles.caption,
      color: tokens.colors.textMuted,
      textAlign: "center",
      marginTop: -unifiedSpacing.sm,
      marginBottom: unifiedSpacing.lg,
    },
    hiddenInput: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0,
      left: -1000, // Move off-screen to prevent any focus artifacts
    },
    pinActions: {
      alignItems: "center",
      gap: unifiedSpacing.xl,
      marginTop: unifiedSpacing.lg,
    },
    biometricButton: {
      alignItems: "center",
      padding: unifiedSpacing.md,
      minHeight: 88,
      justifyContent: "center",
    },
    biometricText: {
      ...textStyles.caption,
      color: tokens.colors.accent,
      fontWeight: "500",
      marginTop: unifiedSpacing.sm,
    },
    pinBottomActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: unifiedSpacing.md,
    },
    actionDivider: {
      width: 1,
      height: 14,
      backgroundColor: tokens.colors.border,
    },
    switchAccountLink: {
      ...textStyles.caption,
      color: tokens.colors.accent,
      fontWeight: "500",
    },
    userBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: unifiedSpacing.md,
      paddingVertical: unifiedSpacing.sm,
      borderRadius: unifiedRadius.full,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      marginBottom: unifiedSpacing.md,
      ...shadows.sm,
    },
    userBadgeAvatar: {
      width: 32,
      height: 32,
      borderRadius: radius.xl,
      backgroundColor: colorWithAlpha(tokens.colors.accent, 0.12),
      justifyContent: "center",
      alignItems: "center",
      marginRight: unifiedSpacing.sm,
    },
    userBadgeName: {
      ...textStyles.caption,
      fontWeight: "600",
      color: tokens.colors.textPrimary,
    },
    logoContainer: {
      width: "100%",
      minHeight: 112,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: unifiedSpacing.lg,
    },
    forgotLink: {
      ...textStyles.caption,
      color: tokens.colors.textMuted,
      textDecorationLine: "underline",
    },
    forgotPasswordContainer: {
      alignItems: "center",
      marginTop: unifiedSpacing.md,
    },
    loginButton: {
      marginTop: unifiedSpacing.lg,
    },
    errorText: {
      ...textStyles.caption,
      color: tokens.colors.error,
      textAlign: "center",
      marginBottom: unifiedSpacing.sm,
    },
    footer: {
      alignItems: "center",
      gap: unifiedSpacing.xs,
    },
    versionText: {
      ...textStyles.caption,
      fontWeight: "500",
      color: tokens.colors.textMuted,
    },
    footerText: {
      ...textStyles.captionSmall,
      color: tokens.colors.textMuted,
    },
  });
