/**
 * Improved Login Screen - Lavanya Mart Stock Verify
 * Enhanced UI/UX following V3 UI/UX Guide requirements
 * 
 * Features:
 * - Enhanced offline status indicators
 * - Standardized error handling
 * - Improved accessibility compliance
 * - Connection status visibility
 * - Biometric support
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ModernButton } from "../src/components/ui/ModernButton";
import { ModernCard } from "../src/components/ui/ModernCard";
import { ModernInput } from "../src/components/ui/ModernInput";
import { ModernHeader } from "../src/components/ui/ModernHeader";
import { useAppVersion } from "../src/hooks/useAppVersion";
import { BrandLogo } from "../src/components/branding/BrandLogo";
import {
  colors as unifiedColors,
  semanticColors,
  spacing as unifiedSpacing,
  radius as unifiedRadius,
  textStyles,
  shadows,
} from "@/theme/unified";

import { AppTouchable } from "@/components/ui/AppTouchable";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useLoginFlow } from "../src/features/auth/hooks/useLoginFlow";
import { OfflineStatusIndicator } from "../src/components/ui/OfflineStatusIndicator";
import { StandardizedErrorCard } from "../src/components/ui/StandardizedErrorCard";

// Mock network status hook - would be replaced with actual network status in real implementation
const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = React.useState(true);
  const [queueDepth, setQueueDepth] = React.useState(0);
  const [lastSyncTime, setLastSyncTime] = React.useState(new Date());

  // Mock implementation - in real app this would come from a network status library
  return {
    isOnline,
    queueDepth,
    lastSyncTime,
    refreshStatus: () => {
      // Simulate refresh
    }
  };
};

// Safe Animated View for Web
const SafeAnimatedView = ({ children, style, entering, ...props }: any) => {
  return (
    <Animated.View style={style} entering={Platform.OS === "web" ? undefined : entering} {...props}>
      {children}
    </Animated.View>
  );
};

export default function ImprovedLoginScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const t = useUiTokens();
  const { version } = useAppVersion();
  const { isOnline, queueDepth, lastSyncTime, refreshStatus } = useNetworkStatus();
  const [error, setError] = React.useState<string | null>(null);
  
  const logoMaxWidth = Math.min(width - unifiedSpacing.xl * 2, isWide ? 320 : 260);

  const pinInputRef = React.useRef<TextInput>(null);

  const {
    loginMode,
    pin,
    username,
    password,
    errors,
    isLoading,
    lastLoggedUser,
    biometricAuthEnabled,
    setLoginMode,
    setUsername,
    setPassword,
    handlePinChange,
    handleBiometricAuth,
    handleForgotPin,
    handleForgotPassword,
    handleLogin,
    toggleLoginMode,
  } = useLoginFlow();

  // Handle login errors with standardized error card
  React.useEffect(() => {
    if (errors.username || errors.password || errors.pin) {
      setError("Login failed. Please check your credentials and try again.");
    } else {
      setError(null);
    }
  }, [errors.username, errors.password, errors.pin]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.colors.background }]} edges={["top", "left", "right"]}>
      <StatusBar style={t.mode === "dark" ? "light" : "dark"} />
      <ModernHeader showLogo title="Lavanya Mart" subtitle="Stock Verification System" />
      
      {/* Enhanced Offline Status Indicator */}
      <View style={styles.statusRow}>
        <OfflineStatusIndicator
          isOnline={isOnline}
          queueDepth={queueDepth}
          lastSyncTime={lastSyncTime}
          onRetry={refreshStatus}
          showQueue={true}
          showLastSync={true}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
        >
          {/* Error Boundary */}
          {error && (
            <StandardizedErrorCard
              title="Login Failed"
              description={error}
              onPrimaryAction={() => setError(null)}
              primaryActionText="Retry"
              errorType={isOnline ? "sync" : "offline"}
            />
          )}

          <View style={[styles.shell, isWide && styles.shellWide]}>
            {/* Welcome Section / Hero Brand Panel */}
            <SafeAnimatedView
              entering={FadeInDown.duration(600).springify()}
              style={[styles.welcomeSection, isWide && styles.welcomeSectionWide]}
            >
              {lastLoggedUser && loginMode === "pin" ? (
                <View
                  style={[
                    styles.userBadge,
                    { backgroundColor: t.colors.surfaceElevated, borderColor: t.colors.border },
                  ]}
                >
                  <View style={[styles.userBadgeAvatar, { backgroundColor: `${t.colors.accent}15` }]}>
                    <Ionicons name="person" size={20} color={t.colors.accent} />
                  </View>
                  <Text style={[styles.userBadgeName, { color: t.colors.textPrimary }]}>
                    {lastLoggedUser.full_name || lastLoggedUser.username}
                  </Text>
                </View>
              ) : (
                <View style={styles.logoContainer}>
                  <BrandLogo variant="wordmark" maxWidth={logoMaxWidth} maxHeight={96} />
                </View>
              )}
              <Text style={[styles.welcomeTitle, { color: t.colors.textPrimary }]}>
                {lastLoggedUser && loginMode === "pin" ? "Welcome Back" : "Lavanya Mart"}
              </Text>
              <Text style={[styles.welcomeSubtitle, { color: t.colors.textSecondary }]}>
                {lastLoggedUser && loginMode === "pin"
                  ? "Scan your fingerprint or enter your 4-digit PIN"
                  : "Secure stock verification & inventory management for your store team."}
              </Text>
            </SafeAnimatedView>

            {/* Form Container */}
            <SafeAnimatedView
              entering={FadeInDown.delay(100).duration(600).springify()}
              style={[styles.formContainer, isWide && styles.formContainerWide]}
            >
              <ModernCard
                style={[styles.loginCard, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}
                padding={unifiedSpacing.xl}
              >
                {/* Mode Toggle */}
                <View style={[styles.modeToggle, { backgroundColor: t.colors.surfaceElevated }]}>
                  <AppTouchable
                    onPress={toggleLoginMode}
                    style={[
                      styles.modeButton,
                      loginMode === "pin"
                        ? { backgroundColor: t.colors.accent }
                        : styles.modeButtonInactive,
                    ]}
                  >
                    <Ionicons
                      name="keypad"
                      size={18}
                      color={loginMode === "pin" ? t.colors.surface : t.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modeButtonText,
                        { color: loginMode === "pin" ? t.colors.surface : t.colors.textSecondary },
                      ]}
                    >
                      PIN
                    </Text>
                  </AppTouchable>

                  <AppTouchable
                    onPress={toggleLoginMode}
                    style={[
                      styles.modeButton,
                      loginMode === "credentials"
                        ? { backgroundColor: t.colors.accent }
                        : styles.modeButtonInactive,
                    ]}
                  >
                    <Ionicons
                      name="person"
                      size={18}
                      color={loginMode === "credentials" ? t.colors.surface : t.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modeButtonText,
                        { color: loginMode === "credentials" ? t.colors.surface : t.colors.textSecondary },
                      ]}
                    >
                      Credentials
                    </Text>
                  </AppTouchable>
                </View>

                {/* PIN Entry Mode */}
                {loginMode === "pin" && (
                  <>
                    <Text style={[styles.formTitle, { color: t.colors.textPrimary }]}>Enter Your PIN</Text>
                    <Text style={[styles.formSubtitle, { color: t.colors.textMuted }]}>4-digit security code</Text>

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
                    <AppTouchable
                      activeOpacity={1}
                      onPress={() => pinInputRef.current?.focus()}
                      style={styles.pinDisplay}
                      accessibilityLabel="Enter PIN"
                    >
                      {[0, 1, 2, 3].map((index) => (
                        <SafeAnimatedView
                          key={index}
                          entering={FadeInDown.delay(index * 40).duration(300)}
                          style={[
                            styles.pinDot,
                            { borderColor: t.colors.border },
                            pin.length > index && { borderColor: t.colors.accent, backgroundColor: t.colors.accent },
                            pin.length === index && { borderColor: t.colors.accentStrong, transform: [{ scale: 1.15 }] },
                          ]}
                        >
                          {pin.length > index && (
                            <View style={[styles.pinDotInner, { backgroundColor: t.colors.surface }]} />
                          )}
                        </SafeAnimatedView>
                      ))}
                    </AppTouchable>

                    {errors.pin && <Text style={[styles.errorText, { color: t.colors.error }]}>{errors.pin}</Text>}

                    {/* Biometric & Switch Options */}
                    <View style={styles.pinActions}>
                      {biometricAuthEnabled && lastLoggedUser?.has_pin ? (
                        <AppTouchable
                          onPress={handleBiometricAuth}
                          style={[
                            styles.biometricButton,
                            { backgroundColor: `${t.colors.accent}12`, borderColor: `${t.colors.accent}33` },
                          ]}
                        >
                          <Ionicons
                            name="finger-print"
                            size={36}
                            color={t.colors.accent}
                          />
                          <Text style={[styles.biometricText, { color: t.colors.accent }]}>Unlock with Biometrics</Text>
                        </AppTouchable>
                      ) : null}

                      <View style={styles.pinBottomActions}>
                        <AppTouchable onPress={handleForgotPin}>
                          <Text style={[styles.forgotLink, { color: t.colors.textSecondary }]}>Forgot PIN?</Text>
                        </AppTouchable>

                        <View style={[styles.actionDivider, { backgroundColor: t.colors.border }]} />

                        <AppTouchable onPress={() => setLoginMode("credentials")}>
                          <Text style={[styles.switchAccountLink, { color: t.colors.accent }]}>Switch Account</Text>
                        </AppTouchable>
                      </View>
                    </View>
                  </>
                )}

                {/* Credentials Entry Mode */}
                {loginMode === "credentials" && (
                  <>
                    <Text style={[styles.formTitle, { color: t.colors.textPrimary }]}>Sign In</Text>

                    <ModernInput
                      label="Username"
                      placeholder="Enter your username"
                      value={username}
                      onChangeText={setUsername}
                      error={errors.username}
                      autoCapitalize="none"
                      icon="person-outline"
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
                      icon="lock-closed-outline"
                      disabled={isLoading}
                    />

                    <AppTouchable
                      onPress={handleForgotPassword}
                      style={styles.forgotPasswordContainer}
                    >
                      <Text style={[styles.forgotLink, { color: t.colors.textSecondary }]}>Forgot Password?</Text>
                    </AppTouchable>
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
                    icon="log-in-outline"
                  />
                )}
              </ModernCard>
            </SafeAnimatedView>
          </View>

          {/* Footer */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(600).springify()}
            style={styles.footer}
          >
            <Text style={[styles.versionText, { color: t.colors.textMuted }]}>Version {version}</Text>
            <Text style={[styles.footerText, { color: t.colors.textMuted }]}>Secure • Reliable • Fast</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: unifiedColors.neutral[50],
  },
  statusRow: {
    marginHorizontal: unifiedSpacing.md,
    marginBottom: unifiedSpacing.sm,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: unifiedSpacing.lg,
    paddingVertical: unifiedSpacing.xl,
    justifyContent: "center",
  },
  scrollContentWide: {
    paddingHorizontal: unifiedSpacing["2xl"],
    alignItems: "center",
  },
  shell: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  shellWide: {
    maxWidth: 960,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: unifiedSpacing["2xl"],
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: unifiedSpacing.xl,
  },
  welcomeSectionWide: {
    flex: 1,
    alignItems: "flex-start",
    marginBottom: 0,
    paddingRight: unifiedSpacing.lg,
  },
  welcomeTitle: {
    ...textStyles.h3,
    color: unifiedColors.neutral[900],
    textAlign: "center",
    marginBottom: unifiedSpacing.xs,
  },
  welcomeSubtitle: {
    ...textStyles.body,
    color: unifiedColors.neutral[600],
    textAlign: "center",
    lineHeight: 24,
  },
  formContainer: {
    marginBottom: unifiedSpacing.xl,
  },
  formContainerWide: {
    width: 420,
    marginBottom: 0,
  },
  loginCard: {
    backgroundColor: unifiedColors.white,
  },
  modeToggle: {
    flexDirection: "row",
    marginBottom: unifiedSpacing.lg,
    backgroundColor: unifiedColors.neutral[100],
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
    backgroundColor: semanticColors.interactive.default,
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
    color: unifiedColors.neutral[600],
  },
  formTitle: {
    ...textStyles.h5,
    color: unifiedColors.neutral[900],
    textAlign: "center",
    marginBottom: unifiedSpacing.lg,
  },
  pinDisplay: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: unifiedSpacing.md,
    marginBottom: unifiedSpacing["2xl"],
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  pinDotEmpty: {
    borderColor: unifiedColors.neutral[300],
    backgroundColor: unifiedColors.transparent,
  },
  pinDotFilled: {
    borderColor: unifiedColors.primary[500],
    backgroundColor: unifiedColors.primary[500],
  },
  pinDotActive: {
    borderColor: unifiedColors.primary[400],
    borderWidth: 2,
    transform: [{ scale: 1.1 }],
  },
  pinDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: unifiedColors.primary[500],
  },
  formSubtitle: {
    ...textStyles.caption,
    color: unifiedColors.neutral[500],
    textAlign: "center",
    marginTop: -unifiedSpacing.sm,
    marginBottom: unifiedSpacing.lg,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  pinActions: {
    alignItems: "center",
    gap: unifiedSpacing.xl,
    marginTop: unifiedSpacing.lg,
  },
  biometricButton: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: unifiedSpacing.md,
    paddingHorizontal: unifiedSpacing.lg,
    borderRadius: unifiedRadius.lg,
    borderWidth: 1,
  },
  biometricText: {
    ...textStyles.caption,
    color: unifiedColors.primary[600],
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
    backgroundColor: unifiedColors.neutral[300],
  },
  switchAccountLink: {
    ...textStyles.caption,
    color: unifiedColors.primary[500],
    fontWeight: "500",
  },
  userBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: unifiedColors.white,
    paddingHorizontal: unifiedSpacing.md,
    paddingVertical: unifiedSpacing.sm,
    borderRadius: unifiedRadius.full,
    borderWidth: 1,
    borderColor: unifiedColors.neutral[200],
    marginBottom: unifiedSpacing.md,
    ...shadows.sm,
  },
  userBadgeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: unifiedColors.primary[50],
    justifyContent: "center",
    alignItems: "center",
    marginRight: unifiedSpacing.sm,
  },
  userBadgeName: {
    ...textStyles.caption,
    fontWeight: "600",
    color: unifiedColors.neutral[800],
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
    color: unifiedColors.neutral[500],
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
    color: semanticColors.status.error,
    textAlign: "center",
    marginTop: unifiedSpacing.sm,
  },
  footer: {
    alignItems: "center",
    gap: unifiedSpacing.xs,
  },
  versionText: {
    ...textStyles.caption,
    fontWeight: "500",
    color: unifiedColors.neutral[500],
  },
  footerText: {
    ...textStyles.captionSmall,
    color: unifiedColors.neutral[400],
  },
});