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

import { useLoginFlow } from "../src/features/auth/hooks/useLoginFlow";

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { version } = useAppVersion();
  const logoMaxWidth = Math.min(width - unifiedSpacing.xl * 2, 280);

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

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style="dark" backgroundColor={unifiedColors.white} />
      <ModernHeader showLogo title="Lavanya Mart" subtitle="Stock Verification System" />
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
                    <Ionicons name="person" size={24} color={unifiedColors.primary[500]} />
                  </View>
                  <Text style={styles.userBadgeName}>
                    {lastLoggedUser.full_name || lastLoggedUser.username}
                  </Text>
                </View>
              ) : (
                <View style={styles.logoContainer}>
                  <BrandLogo variant="wordmark" maxWidth={logoMaxWidth} maxHeight={96} />
                </View>
              )}
              <Text style={styles.welcomeTitle}>
                {lastLoggedUser && loginMode === "pin" ? "Welcome Back" : "Lavanya Mart"}
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
              <ModernCard style={styles.loginCard} padding={unifiedSpacing.lg}>
                {/* Mode Toggle */}
                <View style={styles.modeToggle}>
                  <AppTouchable
                    onPress={toggleLoginMode}
                    style={[
                      styles.modeButton,
                      loginMode === "pin" ? styles.modeButtonActive : styles.modeButtonInactive,
                    ]}
                  >
                    <Ionicons
                      name="keypad"
                      size={20}
                      color={loginMode === "pin" ? unifiedColors.white : unifiedColors.neutral[600]}
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
                  </AppTouchable>

                  <AppTouchable
                    onPress={toggleLoginMode}
                    style={[
                      styles.modeButton,
                      loginMode === "credentials"
                        ? styles.modeButtonActive
                        : styles.modeButtonInactive,
                    ]}>
                    <Ionicons
                      name="person"
                      size={20}
                      color={
                        loginMode === "credentials"
                          ? unifiedColors.white
                          : unifiedColors.neutral[600]
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
                  </AppTouchable>
                </View>

                {/* PIN Entry Mode */}
                {loginMode === "pin" && (
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
                      autoFocus
                      caretHidden
                    />

                    {/* PIN Display - Clickable to focus */}
                    <AppTouchable
                      activeOpacity={1}
                      onPress={() => pinInputRef.current?.focus()}
                      style={styles.pinDisplay}
                      accessibilityLabel="Enter PIN">
                      {[0, 1, 2, 3].map((index) => (
                        <SafeAnimatedView
                          key={index}
                          entering={FadeInDown.delay(index * 50).duration(300)}
                          style={[
                            styles.pinDot,
                            pin.length > index ? styles.pinDotFilled : styles.pinDotEmpty,
                            pin.length === index && styles.pinDotActive,
                          ]}
                        >
                          {pin.length > index && <View style={styles.pinDotInner} />}
                        </SafeAnimatedView>
                      ))}
                    </AppTouchable>

                    {errors.pin && <Text style={styles.errorText}>{errors.pin}</Text>}

                    {/* Biometric & Switch Options */}
                    <View style={styles.pinActions}>
                      {biometricAuthEnabled && lastLoggedUser?.has_pin ? (
                        <AppTouchable
                          onPress={handleBiometricAuth}
                          style={styles.biometricButton}
                        >
                          <Ionicons
                            name="finger-print"
                            size={44}
                            color={unifiedColors.primary[500]}
                          />
                          <Text style={styles.biometricText}>Unlock with Biometrics</Text>
                        </AppTouchable>
                      ) : null}

                      <View style={styles.pinBottomActions}>
                        <AppTouchable onPress={handleForgotPin} >
                          <Text style={styles.forgotLink}>Forgot PIN?</Text>
                        </AppTouchable>

                        <View style={styles.actionDivider} />

                        <AppTouchable
                          onPress={() => setLoginMode("credentials")}
                        >
                          <Text style={styles.switchAccountLink}>Switch Account</Text>
                        </AppTouchable>
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

                    <AppTouchable
                      onPress={handleForgotPassword}
                      style={styles.forgotPasswordContainer}
                    >
                      <Text style={styles.forgotLink}>Forgot Password?</Text>
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
              <Text style={styles.versionText}>Version {version}</Text>
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
    backgroundColor: unifiedColors.neutral[50],
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
    padding: unifiedSpacing.md,
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
